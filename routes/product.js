const express = require('express');
const common = require('../lib/common');
const { restrict, checkAccess } = require('../lib/auth');
const { indexProducts } = require('../lib/indexing');
const { validateJson } = require('../lib/schema');
const colors = require('colors');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const router = express.Router();
var cloudinary = require('cloudinary').v2;
cloudinary.config({ 
    cloud_name: 'plant4u', 
    api_key: '125951334984627', 
    api_secret: 'fIREsPkXsg5cpWyksHDnoykVHYM' 
  });

router.get('/admin/products/:page?', restrict, async (req, res, next) => {
    let pageNum = 1;
    if(req.params.page){
        pageNum = req.params.page;
    }

    // Get our paginated data
    const products = await common.paginateData(false, req, pageNum, 'products', {}, { productAddedDate: -1 });

    res.render('products', {
        title: 'Cart',
        results: products.data,
        totalItemCount: products.totalItems,
        pageNum,
        paginateUrl: 'admin/products',
        resultType: 'top',
        session: req.session,
        admin: true,
        config: req.app.config,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

router.get('/admin/products/filter/:search', restrict, async (req, res, next) => {
    const db = req.app.db;
    const searchTerm = req.params.search;
    const productsIndex = req.app.productsIndex;

    const lunrIdArray = [];
    productsIndex.search(searchTerm).forEach((id) => {
        lunrIdArray.push(common.getId(id.ref));
    });

    // we search on the lunr indexes
    const results = await db.products.find({ _id: { $in: lunrIdArray } }).toArray();

    if(req.apiAuthenticated){
        res.status(200).json(results);
        return;
    }

    res.render('products', {
        title: 'Results',
        results: results,
        resultType: 'filtered',
        admin: true,
        config: req.app.config,
        session: req.session,
        searchTerm: searchTerm,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

// insert form
router.get('/admin/product/new', restrict, checkAccess, (req, res) => {
    res.render('product-new', {
        title: 'New product',
        session: req.session,
        productTitle: common.clearSessionValue(req.session, 'productTitle'),
        productDescription: common.clearSessionValue(req.session, 'productDescription'),
        productPrice: common.clearSessionValue(req.session, 'productPrice'),
        productPermalink: common.clearSessionValue(req.session, 'productPermalink'),
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        editor: true,
        admin: true,
        helpers: req.handlebars.helpers,
        config: req.app.config
    });
});
// Add Filters to product

router.post('/admin/product/filterinsert',restrict, checkAccess, async (req, res) => {
    const db = req.app.db;
    const product = await db.products.findOne({_id: common.getId(req.body.productId)});
    if(!product){
        res.status(400).json({message: "Error Product Not Found"});
    }
    try{
        if(product.filters){
            await db.products.findOneAndUpdate({ _id: common.getId(req.body.productId)},{ $push: { filters: req.body.filterId}});
            res.status(200).json({ message: "Product Filters Inserted"});
        }
        else{
            const filters = [req.body.filterId];
            await db.products.findOneAndUpdate({ _id: common.getId(req.body.productId)},{$set: {filters: filters}});
            res.status(200).json({ message: "Product Filters Inserted"});
        }
    }catch(ex){
        console.log(ex);
        res.status(400).json({message: "Error Inserting filter to product"});
    }
    
});
// Delete a filter from products

router.post('/admin/product/filterdelete',restrict, checkAccess, async (req, res) => {
    const db = req.app.db;
    const product = await db.products.findOne({_id: common.getId(req.body.productId)});
    if(!product){
        res.status(400).json({message: "Error Product Not Found"});
    }
    if(!product.filters){
        res.status(400).json({message: "Error No Filter Present"});
    }
    try{
        if(product.filters){
            await db.products.findOneAndUpdate({ _id: common.getId(req.body.productId)},{ $pull: { filters: req.body.filterId}});
            res.status(200).json({ message: "Product Filters Deleted"});
        }
    }catch(ex){
        console.log(ex);
        res.status(400).json({message: "Error Deleting filter to product"});
    }
    
});


// insert new product form action
router.post('/admin/product/insert', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const doc = {
        productPermalink: req.body.productPermalink,
        productTitle: common.cleanHtml(req.body.productTitle),
        productPrice: parseFloat(req.body.productPrice),
        productDiscountPrice: parseFloat(req.body.productDiscountPrice),
        isPack: common.convertBool(req.body.isPack),
        productpackList: req.body.productpackList,
        productminiDescription: common.cleanHtml(req.body.productminiDescription),
        productDescription: common.cleanHtml(req.body.productDescription),
        productPublished: common.convertBool(req.body.productPublished),
        productTags: req.body.productTags,
        productComment: common.checkboxBool(req.body.productComment),
        productAddedDate: new Date(),
        productStock: common.safeParseInt(req.body.productStock) || null,
        productStockDisable: common.convertBool(req.body.productStockDisable)
    };

    // Validate the body again schema
    const schemaValidate = validateJson('newProduct', doc);
    if(!schemaValidate.result){
        console.log('schemaValidate errors', schemaValidate.errors);
        res.status(400).json(schemaValidate.errors);
        return;
    }

    // Check permalink doesn't already exist
    const product = await db.products.countDocuments({ productPermalink: req.body.productPermalink });
    if(product > 0 && req.body.productPermalink !== ''){
        res.status(400).json({ message: 'Permalink already exists. Pick a new one.' });
        return;
    }

    try{
        const newDoc = await db.products.insertOne(doc);
        // get the new ID
        const newId = newDoc.insertedId;

        // add to lunr index
        indexProducts(req.app)
        .then(() => {
            res.status(200).json({
                message: 'New product successfully created',
                productId: newId
            });
        });
    }catch(ex){
        console.log(colors.red('Error inserting document: ' + ex));
        res.status(400).json({ message: 'Error inserting document' });
    }
});

// render the editor
router.get('/admin/product/edit/:id', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const product = await db.products.findOne({ _id: common.getId(req.params.id) });
    var images = product.productImage;
    
    const filter = await db.filters.find({}).toArray();
    
    const vendors = await db.vendors.find({}).toArray();
    if(!product){
        // If API request, return json
        if(req.apiAuthenticated){
            res.status(400).json({ message: 'Product not found' });
            return;
        }
        req.session.message = 'Product not found';
        req.session.messageType = 'danger';
        res.redirect('/admin/products');
        return;
    }
    // Get variants
    product.variants = await db.variants.find({ product: common.getId(req.params.id) }).toArray();

    // If API request, return json
    if(req.apiAuthenticated){
        res.status(200).json(product);
        return;
    }

    res.render('product-edit', {
        title: 'Edit product',
        result: product,
        images: images,
        filters: filter,
        vendors: vendors,
        admin: true,
        session: req.session,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        config: req.app.config,
        editor: true,
        helpers: req.handlebars.helpers
    });
});

// Add a variant to a product
router.post('/admin/product/addvariant', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const variantDoc = {
        product: req.body.product,
        title: req.body.title,
        price: req.body.price,
        stock: common.safeParseInt(req.body.stock) || null
    };

    // Validate the body again schema
    const schemaValidate = validateJson('newVariant', variantDoc);
    if(!schemaValidate.result){
        if(process.env.NODE_ENV !== 'test'){
            console.log('schemaValidate errors', schemaValidate.errors);
        }
        res.status(400).json(schemaValidate.errors);
        return;
    }

    // Check product exists
    const product = await db.products.findOne({ _id: common.getId(req.body.product) });

    if(!product){
        console.log('here1?');
        res.status(400).json({ message: 'Failed to add product variant' });
        return;
    }

    // Fix values
    variantDoc.product = common.getId(req.body.product);
    variantDoc.added = new Date();

    try{
        const variant = await db.variants.insertOne(variantDoc);
        product.variants = variant.ops;
        res.status(200).json({ message: 'Successfully added variant', product });
    }catch(ex){
        console.log('here?');
        res.status(400).json({ message: 'Failed to add variant. Please try again' });
    }
});

// Update an existing product variant
router.post('/admin/product/editvariant', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const variantDoc = {
        product: req.body.product,
        variant: req.body.variant,
        title: req.body.title,
        price: req.body.price,
        stock: common.safeParseInt(req.body.stock) || null
    };

    // Validate the body again schema
    const schemaValidate = validateJson('editVariant', variantDoc);
    if(!schemaValidate.result){
        if(process.env.NODE_ENV !== 'test'){
            console.log('schemaValidate errors', schemaValidate.errors);
        }
        res.status(400).json(schemaValidate.errors);
        return;
    }

    // Validate ID's
    const product = await db.products.findOne({ _id: common.getId(req.body.product) });
    if(!product){
        res.status(400).json({ message: 'Failed to add product variant' });
        return;
    }

    const variant = await db.variants.findOne({ _id: common.getId(req.body.variant) });
    if(!variant){
        res.status(400).json({ message: 'Failed to add product variant' });
        return;
    }

    // Removed props not needed
    delete variantDoc.product;
    delete variantDoc.variant;

    try{
        const updatedVariant = await db.variants.findOneAndUpdate({
            _id: common.getId(req.body.variant)
        }, {
            $set: variantDoc
        }, {
            returnOriginal: false
        });
        res.status(200).json({ message: 'Successfully saved variant', variant: updatedVariant.value });
    }catch(ex){
        res.status(400).json({ message: 'Failed to save variant. Please try again' });
    }
});

// Remove a product variant
router.post('/admin/product/removevariant', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const variant = await db.variants.findOne({ _id: common.getId(req.body.variant) });
    if(!variant){
        res.status(400).json({ message: 'Failed to remove product variant' });
        return;
    }

    try{
        // Delete the variant
        await db.variants.deleteOne({ _id: variant._id }, {});
        res.status(200).json({ message: 'Successfully removed variant' });
    }catch(ex){
        res.status(400).json({ message: 'Failed to remove variant. Please try again' });
    }
});

// Update an existing product form action
router.post('/admin/product/update', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const product = await db.products.findOne({ _id: common.getId(req.body.productId) });

    if(!product){
        res.status(400).json({ message: 'Failed to update product' });
        return;
    }
    const count = await db.products.countDocuments({ productPermalink: req.body.productPermalink, _id: { $ne: common.getId(product._id) } });
    if(count > 0 && req.body.productPermalink !== ''){
        res.status(400).json({ message: 'Permalink already exists. Pick a new one.' });
        return;
    }
    console.log(req.body.productminiDescription);
    const productDoc = {
        productId: req.body.productId,
        productPermalink: req.body.productPermalink,
        productTitle: common.cleanHtml(req.body.productTitle),
        productPrice: parseFloat(req.body.productPrice),
        productDiscountPrice: parseFloat(req.body.productDiscountPrice),
        isPack: common.convertBool(req.body.isPack),
        productVendor: common.getId(req.body.productVendor),
        productpackList: req.body.productpackList,
        productminiDescription: common.cleanHtml(req.body.productminiDescription),
        productDescription: common.cleanHtml(req.body.productDescription),
        productPublished: common.convertBool(req.body.productPublished),
        productTags: req.body.productTags,
        productComment: common.checkboxBool(req.body.productComment),
        productStock: common.safeParseInt(req.body.productStock) || null,
        productStockDisable: common.convertBool(req.body.productStockDisable),
        productOffer: req.body.productOffer
    };
    
    // Validate the body again schema
    const schemaValidate = validateJson('editProduct', productDoc);
    if(!schemaValidate.result){
        res.status(400).json(schemaValidate.errors);
        return;
    }

    // Remove productId from doc
    delete productDoc.productId;
    productDoc.productImage = product.productImage;

    try{
        await db.products.updateOne({ _id: common.getId(req.body.productId) }, { $set: productDoc }, {});
        // Update the index
        indexProducts(req.app)
        .then(() => {
            res.status(200).json({ message: 'Successfully saved', product: productDoc });
        });
    }catch(ex){
        res.status(400).json({ message: 'Failed to save. Please try again' });
    }
});

// delete a product
router.post('/admin/product/delete', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;
    
    //remote the image from cloudinary
    const product = await db.products.findOne({ _id: common.getId(req.body.productId) });
    var i = 0;
    if(product.productImage){
    for(i = 0; i< product.productImage.length; i++){

        cloudinary.uploader.destroy(product.productImage[i].id, function(error, result) { 
            if(result){
                res.status(200).json({ message: 'Image deleted successfull'});
            }
            else{
                res.status(400).json({ message: 'Image Not deleted'+error});
            }
        });
    }
}
    // remove the product
    await db.products.deleteOne({ _id: common.getId(req.body.productId) }, {});

    // Remove the variants
    await db.variants.deleteMany({ product: common.getId(req.body.productId) }, {});

    // delete any images and folder
    rimraf('public/uploads/' + req.body.productId, (err) => {
        if(err){
            console.info(err.stack);
            res.status(400).json({ message: 'Failed to delete product' });
        }

        // re-index products
        indexProducts(req.app)
        .then(() => {
            res.status(200).json({ message: 'Product successfully deleted' });
        });
    });
});

// update the published state based on an ajax call from the frontend
router.post('/admin/product/publishedState', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    try{
        await db.products.updateOne({ _id: common.getId(req.body.id) }, { $set: { productPublished: common.convertBool(req.body.state) } }, { multi: false });
        res.status(200).json({ message: 'Published state updated' });
    }catch(ex){
        console.error(colors.red('Failed to update the published state: ' + ex));
        res.status(400).json({ message: 'Published state not updated' });
    }
});

// set as main product image
router.post('/admin/product/setasmainimage', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    try{
        const product = await db.products.findOne({ _id: common.getId(req.body.product_id) });
        var i;
        var j;
        var updatedImageList = [];
        for(i=0; i< product.productImage.length; i++){
            if(product.productImage[i].id == req.body.productImage){
                updatedImageList.push(product.productImage[i]);
                break;
            }
        }
        for(j=0; j< product.productImage.length; j++){
            if(product.productImage[j].id != req.body.productImage){
                updatedImageList.push(product.productImage[j]);
            }
        }
        await db.products.updateOne({ _id: common.getId(req.body.product_id) }, { $set: { productImage: updatedImageList } }, { multi: false });
        res.status(200).json({ message: 'Main image successfully set' });
    }catch(ex){
        res.status(400).json({ message: 'Unable to set as main image. Please try again.' });
    }
});

// deletes a product image
router.post('/admin/product/deleteimage', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    // get the productImage from the db
    const product = await db.products.findOne({ _id: common.getId(req.body.product_id) });
    if(!product){
        res.status(400).json({ message: 'Product not found' });
        return;
    }
    var i;
    var found_item = false;
    for(i=0;i<product.productImage.length;i++){
        if(product.productImage[i]['id'] == req.body.productImage){
            found_item = true;
            break;
        }
    }
    if(found_item){
        // set the productImage to null
        if(product.productImage.length == 1){
            await db.products.updateOne({ _id: common.getId(req.body.product_id) }, { $set: { productImage: null } });
        }
        else{
            await db.products.updateOne({ _id: common.getId(req.body.product_id) }, { $pull: { productImage: { id: req.body.productImage, path: req.body.productlink} } });
        }
        

        // remove the image from cloudinary
        cloudinary.uploader.destroy(req.body.productImage, function(error, result) { 
            if(result){
                res.status(200).json({ message: 'Image deleted successfull'});
            }
            else{
                res.status(400).json({ message: 'Image Not deleted'+error});
            }
        });
        
    }else{
        res.status(400).json({ message: 'Image not found in database'});
    }
});

module.exports = router;
