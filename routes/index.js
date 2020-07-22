const express = require('express');
const router = express.Router();
const colors = require('colors');
const stripHtml = require('string-strip-html');
const moment = require('moment');
const _ = require('lodash');
const common = require('../lib/common');
const { indexOrders } = require('../lib/indexing');
const numeral = require('numeral');
const {
    getId,
    hooker,
    clearSessionValue,
    sortMenu,
    getMenu,
    getPaymentConfig,
    getImages,
    updateTotalCart,
    emptyCart,
    updateSubscriptionCheck,
    paginateProducts,
    getSort,
    addSitemapProducts,
    getCountryList
} = require('../lib/common');
const countryList = getCountryList();


//This is how we take checkout action
router.post('/checkout_action', (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
 //   const stripeConfig = common.getPaymentConfig();

    // Create the Stripe payload
   /* const chargePayload = {
        amount: numeral(req.session.totalCartAmount).format('0.00').replace('.', ''),
        currency: stripeConfig.stripeCurrency.toLowerCase(),
        source: req.body.stripeToken,
        description: stripeConfig.stripeDescription,
        shipping: {
            name: `${req.session.customerFirstname} ${req.session.customerFirstname}`,
            address: {
                line1: req.session.customerAddress1,
                line2: req.session.customerAddress2,
                postal_code: req.session.customerPostcode,
                state: req.session.customerState,
                country: req.session.customerCountry
            }
        }
    };  */

    // charge via stripe
   /* stripe.charges.create(chargePayload, (err, charge) => {
        if(err){
            console.info(err.stack);
            req.session.messageType = 'danger';
            req.session.message = 'Your payment has declined. Please try again';
            req.session.paymentApproved = false;
            req.session.paymentDetails = '';
            res.redirect('/checkout/payment');
            return;
        }
   */
        // order status
        let paymentStatus = 'Paid';
       /* if(charge.paid !== true){
            paymentStatus = 'Declined';
        } */

        // new order doc
        const orderDoc = {
           // orderPaymentId: charge.id,
          //  orderPaymentGateway: 'Stripe',
           // orderPaymentMessage: charge.outcome.seller_message,
            orderTotal: req.session.totalCartAmount,
            orderShipping: req.session.totalCartShipping,
            orderItemCount: req.session.totalCartItems,
            orderProductCount: req.session.totalCartProducts,
            orderCustomer: common.getId(req.session.customerId),
            orderEmail: req.session.customerEmail,
           // orderCompany: req.session.customerCompany,
            orderFirstname: req.session.customerFirstname,
            orderLastname: req.session.customerLastname,
            orderAddr1: req.session.customerAddress1,
           // orderAddr2: req.session.customerAddress2,
          //  orderCountry: req.session.customerCountry,
            orderState: req.session.customerState,
            orderPostcode: req.session.customerPostcode,
            orderPhoneNumber: req.session.customerPhone,
            //orderComment: req.session.orderComment,
            orderStatus: paymentStatus,
            orderDate: new Date(),
            orderProducts: req.session.cart,
            orderType: 'Single'
        };

        // insert order into DB
        db.orders.insertOne(orderDoc, (err, newDoc) => {
            if(err){
                console.info(err.stack);
            }

            // get the new ID
            const newId = newDoc.insertedId;

            // add to lunr index
            indexOrders(req.app)
            .then(() => {
                // if approved, send email etc
                    // set the results
                    req.session.messageType = 'success';
                    req.session.message = 'Your payment was successfully completed';
                    req.session.paymentEmailAddr = newDoc.ops[0].orderEmail;
                    req.session.paymentApproved = true;
                    req.session.paymentDetails = '<p><strong>Order ID: </strong>' + newId ;

                    // set payment results for email
                    const paymentResults = {
                        message: req.session.message,
                        messageType: req.session.messageType,
                        paymentEmailAddr: req.session.paymentEmailAddr,
                        paymentApproved: true,
                        paymentDetails: req.session.paymentDetails
                    };

                    // clear the cart
                    if(req.session.cart){
                        common.emptyCart(req, res, 'function');
                    }

                    // send the email with the response
                    // TODO: Should fix this to properly handle result
                    common.sendEmail(req.session.paymentEmailAddr, 'Your payment with ' + config.cartTitle, common.getEmailTemplate(paymentResults));

                    // redirect to outcome
                    res.redirect('/payment/' + newId);
                /*else{
                    // redirect to failure
                    req.session.messageType = 'danger';
                    req.session.message = 'Your payment has declined. Please try again';
                    req.session.paymentApproved = false;
                    req.session.paymentDetails = '<p><strong>Order ID: </strong>' + newId + '</p><p><strong>Transaction ID: </strong>' + charge.id + '</p>';
                    res.redirect('/payment/' + newId);
                } */
            });
        });
    });
// });

// These is the customer facing routes
router.get('/payment/:orderId', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;

    // Get the order
    const order = await db.orders.findOne({ _id: getId(req.params.orderId) });
    if(!order){
        res.render('error', { title: 'Not found', message: 'Order not found', helpers: req.handlebars.helpers, config });
        return;
    }

    // If stock management is turned on payment approved update stock level
    if(config.trackStock && req.session.paymentApproved){
        // Check to see if already updated to avoid duplicate updating of stock
        if(order.productStockUpdated !== true){
            Object.keys(order.orderProducts).forEach(async (productKey) => {
                const product = order.orderProducts[productKey];
                const dbProduct = await db.products.findOne({ _id: getId(product.productId) });
                let productCurrentStock = dbProduct.productStock;

                // If variant, get the stock from the variant
                if(product.variantId){
                    const variant = await db.variants.findOne({
                        _id: getId(product.variantId),
                        product: getId(product._id)
                    });
                    if(variant){
                        productCurrentStock = variant.stock;
                    }else{
                        productCurrentStock = 0;
                    }
                }

                // Calc the new stock level
                let newStockLevel = productCurrentStock - product.quantity;
                if(newStockLevel < 1){
                    newStockLevel = 0;
                }

                // Update stock
                if(product.variantId){
                    // Update variant stock
                    await db.variants.updateOne({
                        _id: getId(product.variantId)
                    }, {
                        $set: {
                            stock: newStockLevel
                        }
                    }, { multi: false });
                }else{
                    // Update product stock
                    await db.products.updateOne({
                        _id: getId(product.productId)
                    }, {
                        $set: {
                            productStock: newStockLevel
                        }
                    }, { multi: false });
                }

                // Add stock updated flag to order
                await db.orders.updateOne({
                    _id: getId(order._id)
                }, {
                    $set: {
                        productStockUpdated: true
                    }
                }, { multi: false });
            });
            console.info('Updated stock levels');
        }
    }

    // If hooks are configured, send hook
    if(config.orderHook){
        await hooker(order);
    };
    let paymentView = `${config.themeViews}payment-complete`;
    if(order.orderPaymentGateway === 'Blockonomics') paymentView = `${config.themeViews}payment-complete-blockonomics`;
    res.render('success', {
        title: 'Payment complete',
        config: req.app.config,
        session: req.session,
        result: order,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter',
        menu: sortMenu(await getMenu(db))
    });
});

router.get('/emptycart', async (req, res, next) => {
    emptyCart(req, res, '');
});

router.get('/checkout/information', async (req, res, next) => {
    const config = req.app.config;

    // if there is no items in the cart then render a failure
    if(!req.session.cart){
        req.session.message = 'The are no items in your cart. Please add some items before checking out';
        req.session.messageType = 'danger';
        res.redirect('/');
        return;
    }

    let paymentType = '';
    if(req.session.cartSubscription){
        paymentType = '_subscription';
    }

    // render the payment page
    res.render(`${config.themeViews}checkout-information`, {
        title: 'Checkout - Information',
        config: req.app.config,
        session: req.session,
        paymentType,
        cartClose: false,
        page: 'checkout-information',
        countryList,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter'
    });
});

router.get('/checkout/shipping', async (req, res, next) => {
    const config = req.app.config;

    // if there is no items in the cart then render a failure
    if(!req.session.cart){
        req.session.message = 'The are no items in your cart. Please add some items before checking out';
        req.session.messageType = 'danger';
        res.redirect('/');
        return;
    }

    if(!req.session.customerEmail){
        req.session.message = 'Cannot proceed to shipping without customer information';
        req.session.messageType = 'danger';
        res.redirect('/checkout/information');
        return;
    }

    // Net cart amount
    const netCartAmount = req.session.totalCartAmount - req.session.totalCartShipping || 0;

    // Recalculate shipping
    config.modules.loaded.shipping.calculateShipping(
        netCartAmount,
        config,
        req
    );

    // render the payment page
    res.render(`${config.themeViews}checkout-shipping`, {
        title: 'Checkout - Shipping',
        config: req.app.config,
        session: req.session,
        cartClose: false,
        cartReadOnly: true,
        page: 'checkout-shipping',
        countryList,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter'
    });
});

router.get('/checkout/cart', (req, res) => {
    const config = req.app.config;
    
    res.render(`${config.themeViews}checkout-cart`, {
        title: 'Checkout - Cart',
        page: req.query.path,
        config,
        session: req.session,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter'
    });
});

router.get('/checkout/cartdata', (req, res) => {
    const config = req.app.config;

    res.status(200).json({
        cart: req.session.cart,
        session: req.session,
        currencySymbol: config.currencySymbol || '$'
    });
});

router.get('/checkout/payment', async (req, res) => {
    const config = req.app.config;

    // if there is no items in the cart then render a failure
    if(!req.session.cart){
        req.session.message = 'The are no items in your cart. Please add some items before checking out';
        req.session.messageType = 'danger';
        res.redirect('/');
        return;
    }

    let paymentType = '';
    if(req.session.cartSubscription){
        paymentType = '_subscription';
    }

    // update total cart amount one last time before payment
    await updateTotalCart(req, res);

    res.render(`${config.themeViews}checkout-payment`, {
        title: 'Checkout - Payment',
        config: req.app.config,
        paymentConfig: getPaymentConfig(),
        session: req.session,
        paymentPage: true,
        paymentType,
        cartClose: true,
        cartReadOnly: true,
        page: 'checkout-information',
        countryList,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter'
    });
});

router.get('/blockonomics_payment', (req, res, next) => {
    const config = req.app.config;
    let paymentType = '';
    if(req.session.cartSubscription){
        paymentType = '_subscription';
    }
// show bitcoin address and wait for payment, subscribing to wss

    res.render(`${config.themeViews}checkout-blockonomics`, {
        title: 'Checkout - Payment',
        config: req.app.config,
        paymentConfig: getPaymentConfig(),
        session: req.session,
        paymentPage: true,
        paymentType,
        cartClose: true,
        cartReadOnly: true,
        page: 'checkout-information',
        countryList,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter'
    });
});

router.post('/checkout/adddiscountcode', async (req, res) => {
    const config = req.app.config;
    const db = req.app.db;

    // if there is no items in the cart return a failure
    if(!req.session.cart){
        res.status(400).json({
            message: 'The are no items in your cart.'
        });
        return;
    }

    // Check if the discount module is loaded
    if(!config.modules.loaded.discount){
        res.status(400).json({
            message: 'Access denied.'
        });
        return;
    }

    // Check defined or null
    if(!req.body.discountCode || req.body.discountCode === ''){
        res.status(400).json({
            message: 'Discount code is invalid or expired'
        });
        return;
    }

    // Validate discount code
    const discount = await db.discounts.findOne({ code: req.body.discountCode });
    if(!discount){
        res.status(400).json({
            message: 'Discount code is invalid or expired'
        });
        return;
    }

    // Validate date validity
    if(!moment().isBetween(moment(discount.start), moment(discount.end))){
        res.status(400).json({
            message: 'Discount is expired'
        });
        return;
    }

    // Set the discount code
    req.session.discountCode = discount.code;

    // Update the cart amount
    await updateTotalCart(req, res);

    // Return the message
    res.status(200).json({
        message: 'Discount code applied'
    });
});

router.post('/checkout/removediscountcode', async (req, res) => {
    // if there is no items in the cart return a failure
    if(!req.session.cart){
        res.status(400).json({
            message: 'The are no items in your cart.'
        });
        return;
    }

    // Delete the discount code
    delete req.session.discountCode;

    // update total cart amount
    await updateTotalCart(req, res);

    // Return the message
    res.status(200).json({
        message: 'Discount code removed'
    });
});

// show an individual product
router.get('/product/:id', async (req, res) => {
    const db = req.app.db;
    const config = req.app.config;
    const productsIndex = req.app.productsIndex;
    var editreviewPermission = false;
    var reviewPermission = false;
    var rdata = {};
    const product = await db.products.findOne({ $or: [{ _id: getId(req.params.id) }, { productPermalink: req.params.id }] });
    const existvalue = "orderProducts.".concat(product._id);
    const ordersUser = await db.orders.findOne({$and: [{ orderCustomer: getId(req.session.customerId) }, { [existvalue] : { $exists : true } }] });
    const reviewUser = await db.reviews.findOne({ $and: [{ productId: getId(product._id) }, { userId: getId(req.session.customerId) }] });
    const reviewslist = await db.reviews.find({ productId: getId(product._id) }).toArray();
    if(!reviewslist){
        reviewslist = false;
    }
    
    if(reviewUser && req.session.customerPresent) {
        editreviewPermission = true;
        rdata.title = reviewUser.title;
        rdata.description = reviewUser.description;
    }
    else if(ordersUser && req.session.customerPresent ) {
        reviewPermission = true;
    }
    if(!product){
        res.render('error', { title: 'Not found', message: 'Product not found', helpers: req.handlebars.helpers, config });
        return;
    }
    if(product.productPublished === false){
        res.render('error', { title: 'Not found', message: 'Product not found', helpers: req.handlebars.helpers, config });
        return;
    }

    // Get variants for this product
    const variants = await db.variants.find({ product: product._id }).sort({ added: 1 }).toArray();

    // If JSON query param return json instead
    if(req.query.json === 'true'){
        res.status(200).json(product);
        return;
    }

    // show the view
    const images = await getImages(product._id, req, res);

    // Related products
    let relatedProducts = {};
    if(config.showRelatedProducts){
        const lunrIdArray = [];
        const productTags = product.productTags.split(',');
        const productTitleWords = product.productTitle.split(' ');
        const searchWords = productTags.concat(productTitleWords);
        searchWords.forEach((word) => {
            productsIndex.search(word).forEach((id) => {
                lunrIdArray.push(getId(id.ref));
            });
        });
        relatedProducts = await db.products.find({
            _id: { $in: lunrIdArray, $ne: product._id }
        }).limit(4).toArray();
    }

    res.render(`${config.themeViews}product`, {
        title: product.productTitle,
        result: product,
        variants,
        images: images,
        relatedProducts,
        productDescription: stripHtml(product.productDescription),
        metaDescription: config.cartTitle + ' - ' + product.productTitle,
        config: config,
        reviewPermission: reviewPermission,
        editreviewPermission: editreviewPermission,
        reviews: reviewslist,
        rdata, rdata,
        session: req.session,
        pageUrl: config.baseUrl + req.originalUrl,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter',
        menu: sortMenu(await getMenu(db))
    });
});

// Add review to product
router.post('/product/addreview', async (req, res, next) => {
    const db = req.app.db;

    if(!req.body.stars){
        res.status(400).json({ message: 'Error ! Enter the stars Rating' });
        res.redirect(req.body.link);
        return;
    }
    if(!req.body.productreviewId){
        res.status(400).json({ message: 'Error ! Product Not Found' });
        res.redirect(req.body.link);
        return;
    }
    if(!req.session.customerId){
        res.status(400).json({ message: 'Error ! Login To Continue' });
        res.redirect(req.body.link);
        return;
    }
    const user = await db.customers.findOne({ _id: getId(req.session.customerId)});
    username = user.firstName;
    const reviewItem = {
        title: req.body.reviewTitle,
        rating: req.body.stars,
        username: username,
        date: new Date(),
        description: req.body.reviewtextarea,
        productId: getId(req.body.productreviewId),
        userId: getId(req.session.customerId)
    }

    try{
        const newDoc = await db.reviews.insertOne(reviewItem);
        const product = await db.products.findOne({ _id: getId(req.body.productreviewId)});
        const reviewslist = await db.reviews.find({ productId: getId(product._id) }).toArray();
        var i = 0;
        var totalrating = 0;
        for(i=0;i<reviewslist.length;i++){
            totalrating += parseInt(reviewslist[i].rating);
        }
        const updatedproduct = await db.products.findOneAndUpdate({_id:product._id},{ $set: {"productRating": totalrating}});
        res.redirect(req.body.link);
    }catch(ex){
        console.log(ex);
        res.status(400).json({ message: 'Error Inserting Reviews. Please try again.' });
    }
});

// Update Review 
router.post('/product/editreview', async (req, res, next) => {
    const db = req.app.db;
    
    if(!req.body.stars){
        res.status(400).json({ message: 'Error ! Enter the stars Rating' });
        res.redirect(req.body.link);
        return;
    }
    if(!req.body.productreviewId){
        res.status(400).json({ message: 'Error ! Product Not Found' });
        res.redirect(req.body.link);
        return;
    }
    if(!req.session.customerId){
        res.status(400).json({ message: 'Error ! Login To Continue' });
        res.redirect(req.body.link);
        return;
    }

    try{
        const updatedreview = await db.reviews.findOneAndUpdate({ productId: getId(req.body.productreviewId), userId: getId(req.session.customerId)},{ $set: {"title": req.body.reviewTitle, "description": req.body.reviewtextarea, "rating": req.body.stars}});
        const reviewslist = await db.reviews.find({ productId: getId(req.body.productreviewId) }).toArray();
        var i = 0;
        var totalrating = 0;
        for(i=0;i<reviewslist.length;i++){
            totalrating += parseInt(reviewslist[i].rating);
        }
        const updatedproduct = await db.products.findOneAndUpdate({_id: getId(req.body.productreviewId)},{ $set: {"productRating": totalrating}});
        res.redirect(req.body.link);
    }
    catch(ex){
        console.log(ex);
        res.redirect(req.body.link);
    }

});

// Gets the current cart
router.get('/cart/retrieve', async (req, res, next) => {
    const db = req.app.db;

    // Get the cart from the DB using the session id
    let cart = await db.cart.findOne({ sessionId: getId(req.session.id) });

    // Check for empty/null cart
    if(!cart){
        cart = [];
    }

    res.status(200).json({ cart: cart.cart });
});

// Updates a single product quantity
router.post('/product/updatecart', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const cartItem = req.body;

    // Check cart exists
    if(!req.session.cart){
        emptyCart(req, res, 'json', 'There are no items if your cart or your cart is expired');
        return;
    }

    const product = await db.products.findOne({ _id: getId(cartItem.productId) });
    if(!product){
        res.status(400).json({ message: 'There was an error updating the cart', totalCartItems: Object.keys(req.session.cart).length });
        return;
    }

    // Calculate the quantity to update
    let productQuantity = cartItem.quantity ? cartItem.quantity : 1;
    if(typeof productQuantity === 'string'){
        productQuantity = parseInt(productQuantity);
    }

    if(productQuantity === 0){
        // quantity equals zero so we remove the item
        delete req.session.cart[cartItem.cartId];
        res.status(400).json({ message: 'There was an error updating the cart', totalCartItems: Object.keys(req.session.cart).length });
        return;
    }

    // Check for a cart
    if(!req.session.cart[cartItem.cartId]){
        res.status(400).json({ message: 'There was an error updating the cart', totalCartItems: Object.keys(req.session.cart).length });
        return;
    }

    const cartProduct = req.session.cart[cartItem.cartId];

    // Set default stock
    let productStock = product.productStock;
    let productPrice = parseFloat(product.productPrice).toFixed(2);

    // Check if a variant is supplied and override values
    if(cartProduct.variantId){
        const variant = await db.variants.findOne({
            _id: getId(cartProduct.variantId),
            product: getId(product._id)
        });
        if(!variant){
            res.status(400).json({ message: 'Error updating cart. Please try again.' });
            return;
        }
        productPrice = parseFloat(variant.price).toFixed(2);
        productStock = variant.stock;
    }

    // If stock management on check there is sufficient stock for this product
    if(config.trackStock){
        // Only if not disabled
        if(product.productStockDisable !== true && productStock){
            // If there is more stock than total (ignoring held)
            if(productQuantity > productStock){
                res.status(400).json({ message: 'There is insufficient stock of this product.' });
                return;
            }

            // Aggregate our current stock held from all users carts
            const stockHeld = await db.cart.aggregate([
                { $match: { sessionId: { $ne: req.session.id } } },
                { $project: { _id: 0 } },
                { $project: { o: { $objectToArray: '$cart' } } },
                { $unwind: '$o' },
                { $group: {
                    _id: {
                        $ifNull: ['$o.v.variantId', '$o.v.productId']
                    },
                    sumHeld: { $sum: '$o.v.quantity' }
                } }
            ]).toArray();

            // If there is stock
            if(stockHeld.length > 0){
                const totalHeld = _.find(stockHeld, ['_id', getId(cartItem.cartId)]).sumHeld;
                const netStock = productStock - totalHeld;

                // Check there is sufficient stock
                if(productQuantity > netStock){
                    res.status(400).json({ message: 'There is insufficient stock of this product.' });
                    return;
                }
            }
        }
    }

    // Update the cart
    req.session.cart[cartItem.cartId].quantity = productQuantity;
    req.session.cart[cartItem.cartId].totalItemPrice = productPrice * productQuantity;

    // update total cart amount
    await updateTotalCart(req, res);

    // Update checking cart for subscription
    updateSubscriptionCheck(req, res);

    // Update cart to the DB
    await db.cart.updateOne({ sessionId: req.session.id }, {
        $set: { cart: req.session.cart }
    });

    res.status(200).json({ message: 'Cart successfully updated', totalCartItems: Object.keys(req.session.cart).length });
});

// Remove single product from cart
router.post('/product/removefromcart', async (req, res, next) => {
    const db = req.app.db;

    // Check for item in cart
    if(!req.session.cart[req.body.cartId]){
        return res.status(400).json({ message: 'Product not found in cart' });
    }

    // remove item from cart
    delete req.session.cart[req.body.cartId];

    // If not items in cart, empty it
    if(Object.keys(req.session.cart).length === 0){
        return emptyCart(req, res, 'json');
    }

    // Update cart in DB
    await db.cart.updateOne({ sessionId: req.session.id }, {
        $set: { cart: req.session.cart }
    });
    // update total cart
    await updateTotalCart(req, res);

    // Update checking cart for subscription
    updateSubscriptionCheck(req, res);

    return res.status(200).json({ message: 'Product successfully removed', totalCartItems: Object.keys(req.session.cart).length });
});

// Totally empty the cart
router.post('/product/emptycart', async (req, res, next) => {
    emptyCart(req, res, 'json');
});

// Add item to cart
router.post('/product/addtocart', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    let productQuantity = req.body.productQuantity ? parseInt(req.body.productQuantity) : 1;
    const productComment = req.body.productComment ? req.body.productComment : null;

    // If maxQuantity set, ensure the quantity doesn't exceed that value
    if(config.maxQuantity && productQuantity > config.maxQuantity){
        return res.status(400).json({
            message: 'The quantity exceeds the max amount. Please contact us for larger orders.'
        });
    }

    // Don't allow negative quantity
    if(productQuantity < 1){
        productQuantity = 1;
    }

    // setup cart object if it doesn't exist
    if(!req.session.cart){
        req.session.cart = {};
    }

    // Get the product from the DB
    const product = await db.products.findOne({ _id: getId(req.body.productId) });

    // No product found
    if(!product){
        return res.status(400).json({ message: 'Error updating cart. Please try again.' });
    }

    // If cart already has a subscription you cannot add anything else
    if(req.session.cartSubscription){
        return res.status(400).json({ message: 'Subscription already existing in cart. You cannot add more.' });
    }

    // If existing cart isn't empty check if product is a subscription
    if(Object.keys(req.session.cart).length !== 0){
        if(product.productSubscription){
            return res.status(400).json({ message: 'You cannot combine subscription products with existing in your cart. Empty your cart and try again.' });
        }
    }

    // Variant checks
    let productCartId = product._id.toString();
    let productPrice = parseFloat(product.productPrice).toFixed(2);
    let productVariantId;
    let productVariantTitle;
    let productStock = product.productStock;

    // Check if a variant is supplied and override values
    if(req.body.productVariant){
        const variant = await db.variants.findOne({
            _id: getId(req.body.productVariant),
            product: getId(req.body.productId)
        });
        if(!variant){
            return res.status(400).json({ message: 'Error updating cart. Variant not found.' });
        }
        productVariantId = getId(req.body.productVariant);
        productVariantTitle = variant.title;
        productCartId = req.body.productVariant;
        productPrice = parseFloat(variant.price).toFixed(2);
        productStock = variant.stock;
    }

    // If stock management on check there is sufficient stock for this product
    if(config.trackStock){
        // Only if not disabled
        if(product.productStockDisable !== true && productStock){
            // If there is more stock than total (ignoring held)
            if(productQuantity > productStock){
                return res.status(400).json({ message: 'There is insufficient stock of this product.' });
            }

            // Aggregate our current stock held from all users carts
            const stockHeld = await db.cart.aggregate([
                { $project: { _id: 0 } },
                { $project: { o: { $objectToArray: '$cart' } } },
                { $unwind: '$o' },
                { $group: {
                    _id: {
                        $ifNull: ['$o.v.variantId', '$o.v.productId']
                    },
                    sumHeld: { $sum: '$o.v.quantity' }
                } }
            ]).toArray();

            // If there is stock
            if(stockHeld.length > 0){
                const heldProduct = _.find(stockHeld, ['_id', getId(productCartId)]);
                if(heldProduct){
                    const netStock = productStock - heldProduct.sumHeld;

                    // Check there is sufficient stock
                    if(productQuantity > netStock){
                        return res.status(400).json({ message: 'There is insufficient stock of this product.' });
                    }
                }
            }
        }
    }

    // if exists we add to the existing value
    let cartQuantity = 0;
    if(req.session.cart[productCartId]){
        cartQuantity = parseInt(req.session.cart[productCartId].quantity) + productQuantity;
        req.session.cart[productCartId].quantity = cartQuantity;
        req.session.cart[productCartId].totalItemPrice = productPrice * parseInt(req.session.cart[productCartId].quantity);
    }else{
        // Set the card quantity
        cartQuantity = productQuantity;

        // new product deets
        const productObj = {};
        productObj.productId = product._id;
        productObj.title = product.productTitle;
        productObj.quantity = productQuantity;
        productObj.totalItemPrice = productPrice * productQuantity;
        productObj.productDescription = product.productDescription;
        productObj.productImage = product.productImage;
        productObj.productComment = productComment;
        productObj.productSubscription = product.productSubscription;
        productObj.variantId = productVariantId;
        productObj.variantTitle = productVariantTitle;
        if(product.productPermalink){
            productObj.link = product.productPermalink;
        }else{
            productObj.link = product._id;
        }

        // merge into the current cart
        req.session.cart[productCartId] = productObj;
    }

    // Update cart to the DB
    await db.cart.updateOne({ sessionId: req.session.id }, {
        $set: { cart: req.session.cart }
    }, { upsert: true });

    // update total cart amount
    await updateTotalCart(req, res);

    // Update checking cart for subscription
    updateSubscriptionCheck(req, res);

    if(product.productSubscription){
        req.session.cartSubscription = product.productSubscription;
    }

    res.status(200).json({
        message: 'Cart successfully updated',
        cartId: productCartId,
        totalCartItems: req.session.totalCartItems
    });
});

// search products
router.get('/search/:searchTerm/:pageNum?', (req, res) => {
    const db = req.app.db;
    const searchTerm = req.params.searchTerm;
    const productsIndex = req.app.productsIndex;
    const config = req.app.config;
    const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

    const lunrIdArray = [];
    productsIndex.search(searchTerm).forEach((id) => {
        lunrIdArray.push(getId(id.ref));
    });

    let pageNum = 1;
    if(req.params.pageNum){
        pageNum = req.params.pageNum;
    }

    Promise.all([
        paginateProducts(true, db, pageNum, { _id: { $in: lunrIdArray } }, getSort()),
        getMenu(db)
    ])
    .then(([results, menu]) => {
        // If JSON query param return json instead
        if(req.query.json === 'true'){
            res.status(200).json(results.data);
            return;
        }

        res.render(`${config.themeViews}category`, {
            title: 'Results',
            results: results.data,
            filtered: true,
            session: req.session,
            metaDescription: req.app.config.cartTitle + ' - Search term: ' + searchTerm,
            searchTerm: searchTerm,
            message: clearSessionValue(req.session, 'message'),
            messageType: clearSessionValue(req.session, 'messageType'),
            productsPerPage: numberProducts,
            totalProductCount: results.totalItems,
            pageNum: pageNum,
            paginateUrl: 'search',
            config: config,
            menu: sortMenu(menu),
            helpers: req.handlebars.helpers,
            showFooter: 'showFooter'
        });
    })
    .catch((err) => {
        console.error(colors.red('Error searching for products', err));
    });
});

// search products
router.get('/category/:cat/:pageNum?', (req, res) => {
    const db = req.app.db;
    const searchTerm = req.params.cat;
    const productsIndex = req.app.productsIndex;
    const config = req.app.config;
    const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

    const lunrIdArray = [];
    productsIndex.search(searchTerm).forEach((id) => {
        lunrIdArray.push(getId(id.ref));
    });

    let pageNum = 1;
    if(req.params.pageNum){
        pageNum = req.params.pageNum;
    }

    Promise.all([
        paginateProducts(true, db, pageNum, { _id: { $in: lunrIdArray } }, getSort()),
        getMenu(db)
    ])
        .then(([results, menu]) => {
            const sortedMenu = sortMenu(menu);

            // If JSON query param return json instead
            if(req.query.json === 'true'){
                res.status(200).json(results.data);
                return;
            }

            res.render(`${config.themeViews}category`, {
                title: `Category: ${searchTerm}`,
                results: results.data,
                filtered: true,
                session: req.session,
                searchTerm: searchTerm,
                metaDescription: `${req.app.config.cartTitle} - Category: ${searchTerm}`,
                message: clearSessionValue(req.session, 'message'),
                messageType: clearSessionValue(req.session, 'messageType'),
                productsPerPage: numberProducts,
                totalProductCount: results.totalItems,
                pageNum: pageNum,
                menuLink: _.find(sortedMenu.items, (obj) => { return obj.link === searchTerm; }),
                paginateUrl: 'category',
                config: config,
                menu: sortedMenu,
                helpers: req.handlebars.helpers,
                showFooter: 'showFooter'
            });
        })
        .catch((err) => {
            console.error(colors.red('Error getting products for category', err));
        });
});

// Language setup in cookie
router.get('/lang/:locale', (req, res) => {
    res.cookie('locale', req.params.locale, { maxAge: 900000, httpOnly: true });
    res.redirect('back');
});

// return sitemap
router.get('/sitemap.xml', (req, res, next) => {
    const sm = require('sitemap');
    const config = req.app.config;

    addSitemapProducts(req, res, (err, products) => {
        if(err){
            console.error(colors.red('Error generating sitemap.xml', err));
        }
        const sitemap = sm.createSitemap(
            {
                hostname: config.baseUrl,
                cacheTime: 600000,
                urls: [
                    { url: '/', changefreq: 'weekly', priority: 1.0 }
                ]
            });

        const currentUrls = sitemap.urls;
        const mergedUrls = currentUrls.concat(products);
        sitemap.urls = mergedUrls;
        // render the sitemap
        sitemap.toXML((err, xml) => {
            if(err){
                return res.status(500).end();
            }
            res.header('Content-Type', 'application/xml');
            res.send(xml);
            return true;
        });
    });
});

router.get('/page/:pageNum', (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

    Promise.all([
        paginateProducts(true, db, req.params.pageNum, {}, getSort()),
        getMenu(db)
    ])
        .then(([results, menu]) => {
            // If JSON query param return json instead
            if(req.query.json === 'true'){
                res.status(200).json(results.data);
                return;
            }

            res.render(`${config.themeViews}index`, {
                title: 'Shop',
                results: results.data,
                session: req.session,
                message: clearSessionValue(req.session, 'message'),
                messageType: clearSessionValue(req.session, 'messageType'),
                metaDescription: req.app.config.cartTitle + ' - Products page: ' + req.params.pageNum,
                config: req.app.config,
                productsPerPage: numberProducts,
                totalProductCount: results.totalItems,
                pageNum: req.params.pageNum,
                paginateUrl: 'page',
                helpers: req.handlebars.helpers,
                showFooter: 'showFooter',
                menu: sortMenu(menu)
            });
        })
        .catch((err) => {
            console.error(colors.red('Error getting products for page', err));
        });
});

// The main entry point of the shop
router.get('/:page?', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

    // if no page is specified, just render page 1 of the cart
    if(!req.params.page){
        Promise.all([
            paginateProducts(true, db, 1, {}, getSort()),
            getMenu(db)
        ])
            .then(async([results, menu]) => {
                // If JSON query param return json instead
                if(req.query.json === 'true'){
                    res.status(200).json(results.data);
                    return;
                }

                res.render(`${config.themeViews}index`, {
                    title: `${config.cartTitle} - Shop`,
                    theme: config.theme,
                    results: results.data,
                    session: req.session,
                    message: clearSessionValue(req.session, 'message'),
                    messageType: clearSessionValue(req.session, 'messageType'),
                    config,
                    productsPerPage: numberProducts,
                    totalProductCount: results.totalItems,
                    pageNum: 1,
                    paginateUrl: 'page',
                    helpers: req.handlebars.helpers,
                    showFooter: 'showFooter',
                    menu: sortMenu(menu)
                });
            })
            .catch((err) => {
                console.error(colors.red('Error getting products for page', err));
            });
    }else{
        if(req.params.page === 'admin'){
            next();
            return;
        }
        // lets look for a page
        const page = await db.pages.findOne({ pageSlug: req.params.page, pageEnabled: 'true' });
        // if we have a page lets render it, else throw 404
        if(page){
            res.render(`${config.themeViews}page`, {
                title: page.pageName,
                page: page,
                searchTerm: req.params.page,
                session: req.session,
                message: clearSessionValue(req.session, 'message'),
                messageType: clearSessionValue(req.session, 'messageType'),
                config: req.app.config,
                metaDescription: req.app.config.cartTitle + ' - ' + page,
                helpers: req.handlebars.helpers,
                showFooter: 'showFooter',
                menu: sortMenu(await getMenu(db))
            });
        }else{
            res.status(404).render('404', {
                title: '404 Error - Page not found',
                config: req.app.config,
                message: '404 Error - Page not found',
                helpers: req.handlebars.helpers,
                showFooter: 'showFooter',
                menu: sortMenu(await getMenu(db))
            });
        }
    }
});

module.exports = router;
