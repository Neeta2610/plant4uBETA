const express = require('express');
const common = require('../lib/common');
const { restrict, checkAccess } = require('../lib/auth');
const escape = require('html-entities').AllHtmlEntities;
const colors = require('colors');
const bcrypt = require('bcryptjs');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mime = require('mime-type/with-db');
const mailer=require('../misc/mailer');
const csrf = require('csurf');
const { validateJson } = require('../lib/schema');
const ObjectId = require('mongodb').ObjectID;
const router = express.Router();
const csrfProtection = csrf({ cookie: true });
var cloudinary = require('cloudinary').v2;

cloudinary.config({ 
    cloud_name: 'plant4u', 
    api_key: '125951334984627', 
    api_secret: 'fIREsPkXsg5cpWyksHDnoykVHYM' 
  });

// Regex
const emailRegex = /\S+@\S+\.\S+/;
const numericRegex = /^\d*\.?\d*$/;

function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}
var nurserypin = fs.readFileSync('csvjson.json');
let nurserydata = JSON.parse(nurserypin);
// Admin section
router.get('/admin', restrict, (req, res, next) => {
    res.redirect('/admin/dashboard');
});

// logout
router.get('/admin/logout', (req, res) => {
    req.session.user = null;
    req.session.message = null;
    req.session.messageType = null;
    res.redirect('/');
});

router.get('/vendor/logout', (req, res) => {
    req.session.vendor = null;
    req.session.vendorName = null;
    req.session.vendorId = null;
    req.session.isVendor = false;
    req.session.message = null;
    req.session.messageType = null;
    res.redirect('/vendor/login');
});

// Used for tests only
if(process.env.NODE_ENV === 'test'){
    router.get('/admin/csrf', csrfProtection, (req, res, next) => {
        res.json({
            csrf: req.csrfToken()
        });
    });
}

// Vendor Section

// vendor login form

router.get('/vendor/login', async (req, res) => {
    const db = req.app.db;

    const userCount = await db.vendors.countDocuments({});
    // we check for a user. If one exists, redirect to login form otherwise setup
    if(userCount && userCount > 0){
        // set needsSetup to false as a user exists
        res.render('vendorlogin', {
            title: 'Vendor Login',
            referringUrl: req.header('Referer'),
            config: req.app.config,
            categories: req.app.categories,
            message: common.clearSessionValue(req.session, 'message'),
            messageType: common.clearSessionValue(req.session, 'messageType'),
            helpers: req.handlebars.helpers
        });
    }else{
        // if there are no users set the "needsSetup" session
        res.redirect('/vendor/setup');
    }
});

router.post('/vendor/login_action', async (req, res) => {
    const db = req.app.db;
    
    const user = await db.vendors.findOne({ userEmail: common.mongoSanitize(req.body.vendoremail) });
    if(!user || user === null){
        messages = 'A user with that email does not exist.';
        res.status(400).json({ message: messages });
        return;
    }

    // we have a user under that email so we compare the password
    bcrypt.compare(req.body.vendorpassword, user.userPassword)
        .then((result) => {
            if(result){
                req.session.vendor = req.body.vendoremail;
                req.session.vendorName = user.vendorName;
                req.session.vendorId = user._id.toString();
                req.session.isVendor = true;
                res.status(200).json({ message: 'Login successful' });
                return;
            }
            // password is not correct
            res.status(400).json({ message: 'Access denied. Check password and try again.' });
        });
});

router.get('/vendor/setup', async (req, res) => {
    const db = req.app.db;

    const userCount = await db.vendors.countDocuments({});
    // dont allow the user to "re-setup" if a user exists.
    // set needsSetup to false as a user exists
    if(userCount === 0){
        res.render('vendorsetup', {
            title: 'Vendor Setup',
            config: req.app.config,
            categories: req.app.categories,
            helpers: req.handlebars.helpers,
            message: common.clearSessionValue(req.session, 'message'),
            messageType: common.clearSessionValue(req.session, 'messageType'),
            showFooter: 'showFooter'
        });
        return;
    }
    res.redirect('/vendor/login');
});

// insert a user
router.post('/vendor/setup_action', async (req, res) => {
    const db = req.app.db;

    const doc = {
        usersName: req.body.usersName,
        userEmail: req.body.userEmail,
        userPassword: bcrypt.hashSync(req.body.userPassword, 10),
    };

    // check for users
    const userCount = await db.vendors.countDocuments({});
    if(userCount === 0){
        // email is ok to be used.
        try{
            await db.vendors.insertOne(doc);
            res.status(200).json({ message: 'User account inserted' });
            return;
        }catch(ex){
            console.error(colors.red('Failed to insert user: ' + ex));
            res.status(200).json({ message: 'Setup failed' });
            return;
        }
    }
    res.status(200).json({ message: 'Already setup.' });
});

router.get('/vendor/dashboard/:page?', async (req, res) => {
    const db = req.app.db;
    const vendorexist = await db.vendors.findOne({_id: common.getId(req.session.vendorId)});
    if(!vendorexist) {
        req.session.message = "Vendor Access Denied";
        req.session.messageType = 'danger';
        res.redirect('/vendor/login');
        return;
    }
    let pageNum = 1;
    if(req.params.page){
        pageNum = req.params.page;
    }

    // Get our paginated data
    var orders = {};
    var query = '';
    if(!isEmpty(req.query)) {
        query = req.query.status;
        orders = await common.paginateData(false, req, pageNum, 'orders', {orderStatus: req.query.status}, { orderDate: -1 });
    }
    else {
        orders = await common.paginateData(false, req, pageNum, 'orders', {}, { orderDate: -1 });
    }
    var pageNumArray = [];
    var nextPage = 0;
    var prevPage = 0;
    pageNum = parseInt(pageNum);
    if(pageNum % 4 == 2){
        nextPage = pageNum + 2;
        prevPage = pageNum - 2;
        pageNumArray = [pageNum -1 , pageNum, pageNum + 1];
    }
    else if(pageNum % 4 == 3){
        nextPage = pageNum + 1;
        prevPage = pageNum - 3;
        pageNumArray = [pageNum - 2, pageNum -1, pageNum];
    }
    else{
        nextPage = pageNum + 3;
        pageNumArray = [pageNum,pageNum+1,pageNum+2];
        prevPage = pageNum - 1;
    }
    var queryString = "?status=".concat(query);
    res.render('vendordashboard', {
        title: 'Vendor Dashboard',
        config: req.app.config,
        session: req.session,
        orders: orders,
        pageNum: pageNum,
        paginateUrl: '/vendor/dashboard',
        query: queryString,
        pageNumArray: pageNumArray,
        vendor: true,
        nextPage: nextPage,
        prevPage: prevPage,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

router.get('/vendor/order/update/:id', async (req,res) =>{
    const db = req.app.db;
    const vendorexist = await db.vendors.findOne({_id: common.getId(req.session.vendorId)});
    if(!vendorexist) {
        req.session.message = "Vendor Access Denied";
        req.session.messageType = 'danger';
        res.redirect('/vendor/login');
        return;
    }
    const order = await db.orders.findOne({ _id: common.getId(req.params.id) });
    if(!order) {
        req.session.message = "Order Not Found";
        req.session.messageType = 'danger';
        res.redirect('/vendor/dashboard');
        return;
    }
    res.render('vendororder', {
        title: 'View order',
        result: order,
        config: req.app.config,
        session: req.session,
        vendor: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

router.post('/vendor/order/statusupdate', async (req, res)=>{
    const db = req.app.db;
    const vendorexist = await db.vendors.findOne({_id: common.getId(req.session.vendorId)});
    if(!vendorexist) {
        req.session.message = "Vendor Access Denied";
        req.session.messageType = 'danger';
        res.redirect('/vendor/login');
        return;
    }
    try{
        await db.orders.findOneAndUpdate({_id: common.getId(req.body.order_id)},{ $set: {orderStatus: req.body.status}});
        const order = await db.orders.findOne({_id: common.getId(req.body.order_id)});
        var items = ``;
        for(let key in order.orderProducts){
            items += `<tr class="item">
                        <td>
                            `+order.orderProducts[key].title+`
                        </td>
                        
                        <td>
                        `+order.orderProducts[key].totalItemPrice+`
                        </td>
                    </tr>`;
        }
            
        if(order.orderStatus === "Completed")
        {
            const html=`<head>
            <meta charset="utf-8">
            <title>Plant4u Ebill</title>
            
            <style>
            .invoice-box {
                max-width: 800px;
                margin: auto;
                padding: 30px;
                border: 1px solid #eee;
                box-shadow: 0 0 10px rgba(0, 0, 0, .15);
                font-size: 16px;
                line-height: 24px;
                font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif;
                color: #555;
            }
            
            .invoice-box table {
                width: 100%;
                line-height: inherit;
                text-align: left;
            }
            
            .invoice-box table td {
                padding: 5px;
                vertical-align: top;
            }
            
            .invoice-box table tr td:nth-child(2) {
                text-align: right;
            }
            
            .invoice-box table tr.top table td {
                padding-bottom: 20px;
            }
            
            .invoice-box table tr.top table td.title {
                font-size: 45px;
                line-height: 45px;
                color: #333;
            }
            
            .invoice-box table tr.information table td {
                padding-bottom: 40px;
            }
            
            .invoice-box table tr.heading td {
                background: #eee;
                border-bottom: 1px solid #ddd;
                font-weight: bold;
            }
            
            .invoice-box table tr.details td {
                padding-bottom: 20px;
            }
            
            .invoice-box table tr.item td{
                border-bottom: 1px solid #eee;
            }
            
            .invoice-box table tr.item.last td {
                border-bottom: none;
            }
            
            .invoice-box table tr.total td:nth-child(2) {
                border-top: 2px solid #eee;
                font-weight: bold;
            }
            
            @media only screen and (max-width: 600px) {
                .invoice-box table tr.top table td {
                    width: 100%;
                    display: block;
                    text-align: center;
                }
                
                .invoice-box table tr.information table td {
                    width: 100%;
                    display: block;
                    text-align: center;
                }
            }
            
            /** RTL **/
            .rtl {
                direction: rtl;
                font-family: Tahoma, 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif;
            }
            
            .rtl table {
                text-align: right;
            }
            
            .rtl table tr td:nth-child(2) {
                text-align: left;
            }
            </style>
        </head>
        
        <body>
            <div class="invoice-box">
                <table cellpadding="0" cellspacing="0">
                    <tr class="top">
                        <td colspan="2">
                            <table>
                                <tr>
                                    <td class="title">
                                        <img src="https://res.cloudinary.com/plant4u/image/upload/v1597585136/4_zwivhs.png" style="width:100%; max-width:300px;">
                                    </td>
                                    
                                    <td>
                                        Ordered: `+order.orderDate+`<br>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <tr class="information">
                        <td colspan="2">
                            <table>
                                <tr>
                                    <td>
                                        plant4u, Inc.<br>
                                        Some Building<br>
                                        New Delhi
                                    </td>
                                    
                                    <td>
                                        `+order.orderFirstname+` `+order.orderLastname+`<br>
                                        `+order.orderPhoneNumber+`<br>
                                        `+order.orderEmail+`
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <tr class="heading">
                        <td>
                            Payment Method
                        </td>
                        
                        <td>
                            `+order.orderPaymentGateway+`
                        </td>
                    </tr>
                    
                    <tr class="details">
                        <td>
                            Amount
                        </td>
                        
                        <td>
                            `+order.orderTotal+`
                        </td>
                    </tr>
                    
                    <tr class="heading">
                        <td>
                            Item
                        </td>
                        
                        <td>
                            Price
                        </td>
                    </tr>
                    `+items+`
                    
                    <tr class="total">
                        <td></td>
                        
                        <td>
                           Total: `+order.orderTotal+`
                        </td>
                    </tr>
                </table>
            </div>
        </body>
        
    `;
    await mailer.sendEmail('admin@plant4u.in',order.orderEmail,'Order Complete',html)
        }
        res.status(200).json({message: "Order Status Updated"});
        return;
    }catch(ex){
        console.log(ex);
        res.status(400).json({message: "Error Updating Status"});
        return;
    }
});
// login form
router.get('/admin/login', async (req, res) => {
    const db = req.app.db;

    const userCount = await db.users.countDocuments({});
    // we check for a user. If one exists, redirect to login form otherwise setup
    if(userCount && userCount > 0){
        // set needsSetup to false as a user exists
        req.session.needsSetup = false;
        res.render('login', {
            title: 'Login',
            referringUrl: req.header('Referer'),
            config: req.app.config,
            categories: req.app.categories,
            message: common.clearSessionValue(req.session, 'message'),
            messageType: common.clearSessionValue(req.session, 'messageType'),
            helpers: req.handlebars.helpers
        });
    }else{
        // if there are no users set the "needsSetup" session
        req.session.needsSetup = true;
        res.redirect('/admin/setup');
    }
});

// login the user and check the password
router.post('/admin/login_action', async (req, res) => {
    const db = req.app.db;
    
    const user = await db.users.findOne({ userEmail: common.mongoSanitize(req.body.adminemail) });
    if(!user || user === null){
        messages = 'A user with that email does not exist.';
        res.status(400).json({ message: messages });
        return;
    }

    // we have a user under that email so we compare the password
    bcrypt.compare(req.body.adminpassword, user.userPassword)
        .then((result) => {
            if(result){
                req.session.user = req.body.adminemail;
                req.session.usersName = user.usersName;
                req.session.userId = user._id.toString();
                req.session.isAdmin = user.isAdmin;
                res.status(200).json({ message: 'Login successful' });
                return;
            }
            // password is not correct
            res.status(400).json({ message: 'Access denied. Check password and try again.' });
        });
});

// setup form is shown when there are no users setup in the DB
router.get('/admin/setup', async (req, res) => {
    const db = req.app.db;

    const userCount = await db.users.countDocuments({});
    // dont allow the user to "re-setup" if a user exists.
    // set needsSetup to false as a user exists
    req.session.needsSetup = false;
    if(userCount === 0){
        req.session.needsSetup = true;
        res.render('setup', {
            title: 'Setup',
            config: req.app.config,
            categories: req.app.categories,
            helpers: req.handlebars.helpers,
            message: common.clearSessionValue(req.session, 'message'),
            messageType: common.clearSessionValue(req.session, 'messageType'),
            showFooter: 'showFooter'
        });
        return;
    }
    res.redirect('/admin/login');
});

// insert a user
router.post('/admin/setup_action', async (req, res) => {
    const db = req.app.db;

    const doc = {
        usersName: req.body.usersName,
        userEmail: req.body.userEmail,
        userPassword: bcrypt.hashSync(req.body.userPassword, 10),
        isAdmin: true,
        isOwner: true
    };

    // check for users
    const userCount = await db.users.countDocuments({});
    if(userCount === 0){
        // email is ok to be used.
        try{
            await db.users.insertOne(doc);
            res.status(200).json({ message: 'User account inserted' });
            return;
        }catch(ex){
            console.error(colors.red('Failed to insert user: ' + ex));
            res.status(200).json({ message: 'Setup failed' });
            return;
        }
    }
    res.status(200).json({ message: 'Already setup.' });
});

// dashboard
router.get('/admin/dashboard', csrfProtection, restrict, async (req, res) => {
    const db = req.app.db;

    // Collate data for dashboard
    const dashboardData = {
        productsCount: await db.products.countDocuments({
            productPublished: true
        }),
        ordersCount: await db.orders.countDocuments({}),
        ordersAmount: await db.orders.aggregate([{ $match: {} },
            { $group: { _id: null, sum: { $sum: '$orderTotal' } }
        }]).toArray(),
        productsSold: await db.orders.aggregate([{ $match: {} },
            { $group: { _id: null, sum: { $sum: '$orderProductCount' } }
        }]).toArray(),
        topProducts: await db.orders.aggregate([
            { $project: { _id: 0 } },
            { $project: { o: { $objectToArray: '$orderProducts' } } },
            { $unwind: '$o' },
            { $group: {
                    _id: '$o.v.title',
                    productImage: { $last: '$o.v.productImage' },
                    count: { $sum: '$o.v.quantity' }
            } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]).toArray()
    };

    // Fix aggregate data
    if(dashboardData.ordersAmount.length > 0){
        dashboardData.ordersAmount = dashboardData.ordersAmount[0].sum;
    }
    if(dashboardData.productsSold.length > 0){
        dashboardData.productsSold = dashboardData.productsSold[0].sum;
    }else{
        dashboardData.productsSold = 0;
    }

    res.render('dashboard', {
        title: 'Cart dashboard',
        session: req.session,
        admin: true,
        dashboardData,
        themes: common.getThemes(),
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        csrfToken: req.csrfToken()
    });
});

// settings
router.get('/admin/settings', csrfProtection, restrict, (req, res) => {
    res.render('settings', {
        title: 'Cart settings',
        session: req.session,
        admin: true,
        themes: common.getThemes(),
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        footerHtml: typeof req.app.config.footerHtml !== 'undefined' ? escape.decode(req.app.config.footerHtml) : null,
        googleAnalytics: typeof req.app.config.googleAnalytics !== 'undefined' ? escape.decode(req.app.config.googleAnalytics) : null,
        csrfToken: req.csrfToken()
    });
});

// create API key
router.post('/admin/createApiKey', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;
    const result = await db.users.findOneAndUpdate({
        _id: ObjectId(req.session.userId),
        isAdmin: true
    }, {
        $set: {
            apiKey: new ObjectId()
        }
    }, {
        returnOriginal: false
    });

    if(result.value && result.value.apiKey){
        res.status(200).json({ message: 'API Key generated', apiKey: result.value.apiKey });
        return;
    }
    res.status(400).json({ message: 'Failed to generate API Key' });
});

// settings update
router.post('/admin/settings/update', restrict, checkAccess, (req, res) => {
    const result = common.updateConfig(req.body);
    if(result === true){
        req.app.config = common.getConfig();
        res.status(200).json({ message: 'Settings successfully updated' });
        return;
    }
    res.status(400).json({ message: 'Permission denied' });
});

// settings menu
router.get('/admin/settings/menu', csrfProtection, restrict, async (req, res) => {
    const db = req.app.db;
    res.render('settings-menu', {
        title: 'Cart menu',
        session: req.session,
        admin: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        menu: common.sortMenu(await common.getMenu(db)),
        csrfToken: req.csrfToken()
    });
});

// Filter Menu
router.get('/admin/settings/filters', csrfProtection, restrict, async (req, res) => {
    const db = req.app.db;

    var filters = await db.filters.find({}).toArray();
    if(!filters){
        filters = false;
    }
    res.render('settings-filters', {
        title: 'Filters List',
        session: req.session,
        admin: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        filters: filters,
        csrfToken: req.csrfToken()
    });
});

//filter edit

router.get('/admin/settings/filters/edit/:id', csrfProtection, restrict, async (req, res) => {
    const db = req.app.db;
    const catId = req.params.id; 
    const filter = await db.filters.findOne({ _id: common.getId(catId) });
    res.render('settings-filters-edit', {
        title: 'Filters Edit',
        session: req.session,
        admin: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        filter: filter,
        csrfToken: req.csrfToken()
    });
});

// enter new filter
router.post('/admin/settings/filters/new', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;

    if(!req.body.newNavFilter){
        res.status(400).json({message: "Name Field Can Not Be Empty"});
        return;
    }

    const item = {
        title: req.body.newNavFilter,
        submenu: []
    };
    
    try{
        const teempvar = await db.filters.insertOne(item);
        res.status(200).json({ message: "Filter created successfull"});
    }
    catch(ex){
        res.status(400).json({ message: "Error inserting Filter title" });
        return;
    }
});
router.post('/admin/settings/filters/update', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;

    const filter = await db.filters.findOne({ _id: common.getId(req.body.filterId)});
    if(!filter){
        res.status(400).json({ message: "Error Filter Not Found"});
        return;
    }
    if(!req.body.submenuValue){
        res.status(400).json({message : "Submenu Can't Be empty"});
        return;
    }
    
    try{
        const last = await db.lastidvalue.find({}).toArray();
        var lastidvalue = 0;
        if(last.length == 0){
            const val = {
                value: 1
            }
            await db.lastidvalue.insertOne(val);
        }
        else{
            lastidvalue = last[0].value;
            await db.lastidvalue.findOneAndUpdate({ _id: common.getId(last[0]._id)},{ $inc: { value: 1}});
        }
        const submenuNewValue = {
            title: req.body.submenuValue,
            id: lastidvalue
        }
        const value = await db.filters.findOneAndUpdate({ _id: filter._id },{ $push: { submenu: submenuNewValue }});
        res.status(200).json({ message: "Filter Updated"});
    }catch(ex){
        console.log(ex);
        res.status(400).json({ message: "Error Updating Categories"});
    }
});
// delete a filter
router.post('/admin/settings/filters/delete', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;

    try {
        await db.filters.findOneAndDelete({ _id: common.getId(req.body.filterId)});
        res.status(200).json({message: "Filter Deleted"});
    }
    catch(ex){
        console.log(ex);
        res.status(400).json({message: "Error Deleting Filter"});
    }
});

// Update Filter Name 
router.post('/admin/settings/filters/changename', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;

    try {
        await db.filters.findOneAndUpdate({ _id: common.getId(req.body.filterId)},{$set: { title: req.body.newName}});
        res.status(200).json({message: "Filter Name Changed"});
    }
    catch(ex){
        console.log(ex);
        res.status(400).json({message: "Error Updating Filter"});
    }
});

// Delete Filter Submenu
router.post('/admin/settings/filters/deletesubmenu', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;
    console.log(req.body.subId);
    try {
        await db.filters.findOneAndUpdate({ _id: common.getId(req.body.filterId)},{ $pull: { submenu: { id: parseInt(req.body.subId) }}});
        res.status(200).json({message: "Filter Submenu Deleted"});
    }
    catch(ex){
        console.log(ex);
        res.status(400).json({message: "Error Updating Filter"});
    }
});

// filters route end

// page list
router.get('/admin/settings/pages', csrfProtection, restrict, async (req, res) => {
    const db = req.app.db;
    const pages = await db.pages.find({}).toArray();

    res.render('settings-pages', {
        title: 'Static pages',
        pages: pages,
        session: req.session,
        admin: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        menu: common.sortMenu(await common.getMenu(db)),
        csrfToken: req.csrfToken()
    });
});

// pages new
router.get('/admin/settings/pages/new', csrfProtection, restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    res.render('settings-page', {
        title: 'Static pages',
        session: req.session,
        admin: true,
        button_text: 'Create',
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        menu: common.sortMenu(await common.getMenu(db)),
        csrfToken: req.csrfToken()
    });
});

// pages editor
router.get('/admin/settings/pages/edit/:page', csrfProtection, restrict, checkAccess, async (req, res) => {
    const db = req.app.db;
    const page = await db.pages.findOne({ _id: common.getId(req.params.page) });
    const menu = common.sortMenu(await common.getMenu(db));
    if(!page){
        res.status(404).render('404', {
            title: '404 Error - Page not found',
            config: req.app.config,
            message: '404 Error - Page not found',
            helpers: req.handlebars.helpers,
            showFooter: 'showFooter',
            menu
        });
        return;
    }

    res.render('settings-page', {
        title: 'Static pages',
        page: page,
        button_text: 'Update',
        session: req.session,
        admin: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        menu,
        csrfToken: req.csrfToken()
    });
});

// insert/update page
router.post('/admin/settings/page', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const doc = {
        pageName: req.body.pageName,
        pageSlug: req.body.pageSlug,
        pageEnabled: req.body.pageEnabled,
        pageContent: req.body.pageContent
    };

    if(req.body.pageId){
        // existing page
        const page = await db.pages.findOne({ _id: common.getId(req.body.pageId) });
        if(!page){
            res.status(400).json({ message: 'Page not found' });
            return;
        }

        try{
            const updatedPage = await db.pages.findOneAndUpdate({ _id: common.getId(req.body.pageId) }, { $set: doc }, { returnOriginal: false });
            res.status(200).json({ message: 'Page updated successfully', pageId: req.body.pageId, page: updatedPage.value });
        }catch(ex){
            res.status(400).json({ message: 'Error updating page. Please try again.' });
        }
    }else{
        // insert page
        try{
            const newDoc = await db.pages.insertOne(doc);
            res.status(200).json({ message: 'New page successfully created', pageId: newDoc.insertedId });
            return;
        }catch(ex){
            res.status(400).json({ message: 'Error creating page. Please try again.' });
        }
    }
});

// delete a page
router.post('/admin/settings/page/delete', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const page = await db.pages.findOne({ _id: common.getId(req.body.pageId) });
    if(!page){
        res.status(400).json({ message: 'Page not found' });
        return;
    }

    try{
        await db.pages.deleteOne({ _id: common.getId(req.body.pageId) }, {});
        res.status(200).json({ message: 'Page successfully deleted' });
        return;
    }catch(ex){
        res.status(400).json({ message: 'Error deleting page. Please try again.' });
    }
});

// Categories menu
router.get('/admin/settings/categories', csrfProtection, restrict, async (req, res) => {
    const db = req.app.db;

    var category = await db.categories.find({}).toArray();
    if(!category){
        category = false;
    }
    res.render('settings-categories', {
        title: 'Catgories List',
        session: req.session,
        admin: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        categories: category,
        csrfToken: req.csrfToken()
    });
});

// categories edit list
router.get('/admin/settings/categories/edit/:id', csrfProtection, restrict, async (req, res) => {
    const db = req.app.db;
    const catId = req.params.id; 
    const category = await db.categories.findOne({ _id: common.getId(catId) });
    res.render('settings-categories-edit', {
        title: 'Catgories Edit',
        session: req.session,
        admin: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        category: category,
        csrfToken: req.csrfToken()
    });
});

// New Categories Heading add
router.post('/admin/settings/categories/new', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;

    if(!req.body.newNavCategories){
        res.status(400).json({message: "Name Field Not Empty"});
        return;
    }

    const item = {
        title: req.body.newNavCategories,
        submenu: []
    };
    
    try{
        const teempvar = await db.categories.insertOne(item);
        res.status(200).json({ message: "Categories created successfull"});
    }
    catch(ex){
        res.status(400).json({ message: "Error inserting Category title" });
        return;
    }
});
router.post('/admin/settings/categories/update', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;

    const category = await db.categories.findOne({ _id: common.getId(req.body.categoryId)});
    if(!category){
        res.status(400).json({ message: "Error Category Not Found"});
        return;
    }
    if(!req.body.submenuValue){
        res.status(400).json({message : "Submenu Can't Be empty"});
        return;
    }
    
    try{
        const value = await db.categories.findOneAndUpdate({ _id: category._id },{ $push: { submenu: req.body.submenuValue }});
        req.app.categories = await db.categories.find({}).toArray();
        res.status(200).json({ message: "Categories Updated"});
    }catch(ex){
        console.log(ex);
        res.status(400).json({ message: "Error Updating Categories"});
    }
});
// delete a category
router.post('/admin/settings/categories/delete', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;

    try {
        await db.categories.findOneAndDelete({ _id: common.getId(req.body.categoryId)});
        req.app.categories = await db.categories.find({}).toArray();
        res.status(200).json({message: "Category Deleted"});
    }
    catch(ex){
        console.log(ex);
        res.status(400).json({message: "Error Deleting Category"});
    }
});

// Update Category Name 
router.post('/admin/settings/categories/changename', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;

    try {
        await db.categories.findOneAndUpdate({ _id: common.getId(req.body.categoryId)},{$set: { title: req.body.newName}});
        req.app.categories = await db.categories.find({}).toArray();
        res.status(200).json({message: "Category Name Changed"});
    }
    catch(ex){
        console.log(ex);
        res.status(400).json({message: "Error Updating Category"});
    }
});

// Delete Submenu
router.post('/admin/settings/categories/deletesubmenu', restrict, checkAccess,async (req, res) => {
    const db = req.app.db;
    console.log(req.body.categoryId,req.body.subName);
    try {
        await db.categories.findOneAndUpdate({ _id: common.getId(req.body.categoryId)},{ $pull: { submenu: req.body.subName}});
        req.app.categories = await db.categories.find({}).toArray();
        res.status(200).json({message: "Category Submenu Deleted"});
    }
    catch(ex){
        console.log(ex);
        res.status(400).json({message: "Error Updating Category"});
    }
});

// new menu item
router.post('/admin/settings/menu/new', restrict, checkAccess, (req, res) => {
    const result = common.newMenu(req);
    if(result === false){
        res.status(400).json({ message: 'Failed creating menu.' });
        return;
    }
    res.status(200).json({ message: 'Menu created successfully.' });
});

// update existing menu item
router.post('/admin/settings/menu/update', restrict, checkAccess, (req, res) => {
    const result = common.updateMenu(req);
    if(result === false){
        res.status(400).json({ message: 'Failed updating menu.' });
        return;
    }
    res.status(200).json({ message: 'Menu updated successfully.' });
});

// delete menu item
router.post('/admin/settings/menu/delete', restrict, checkAccess, (req, res) => {
    const result = common.deleteMenu(req, req.body.menuId);
    if(result === false){
        res.status(400).json({ message: 'Failed deleting menu.' });
        return;
    }
    res.status(200).json({ message: 'Menu deleted successfully.' });
});

// We call this via a Ajax call to save the order from the sortable list
router.post('/admin/settings/menu/saveOrder', restrict, checkAccess, (req, res) => {
    const result = common.orderMenu(req, res);
    if(result === false){
        res.status(400).json({ message: 'Failed saving menu order' });
        return;
    }
    res.status(200).json({});
});

// validate the permalink
router.post('/admin/validatePermalink', async (req, res) => {
    // if doc id is provided it checks for permalink in any products other that one provided,
    // else it just checks for any products with that permalink
    const db = req.app.db;

    let query = {};
    if(typeof req.body.docId === 'undefined' || req.body.docId === ''){
        query = { productPermalink: req.body.permalink };
    }else{
        query = { productPermalink: req.body.permalink, _id: { $ne: common.getId(req.body.docId) } };
    }

    const products = await db.products.countDocuments(query);
    if(products && products > 0){
        res.status(400).json({ message: 'Permalink already exists' });
        return;
    }
    res.status(200).json({ message: 'Permalink validated successfully' });
});

// Discount codes
router.get('/admin/settings/discounts', csrfProtection, restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const discounts = await db.discounts.find({}).toArray();

    res.render('settings-discounts', {
        title: 'Discount code',
        config: req.app.config,
        session: req.session,
        discounts,
        admin: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        csrfToken: req.csrfToken()
    });
});

// Edit a discount code
router.get('/admin/settings/discount/edit/:id', csrfProtection, restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    const discount = await db.discounts.findOne({ _id: common.getId(req.params.id) });

    res.render('settings-discount-edit', {
        title: 'Discount code edit',
        session: req.session,
        admin: true,
        discount,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        csrfToken: req.csrfToken()
    });
});

// Update discount code
router.post('/admin/settings/discount/update', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

     // Doc to insert
     const discountDoc = {
        discountId: req.body.discountId,
        code: req.body.code,
        type: req.body.type,
        value: parseInt(req.body.value),
        minimum:parseInt(req.body.minimum),
        onceUser: common.convertBool(req.body.onceUser),
        new:req.body.new,
        isHide: common.convertBool(req.body.hide),
        onceUsed: common.convertBool(req.body.onlyonce),
        start: moment(req.body.start , 'DD/MM/YYYY HH:mm').toDate().toString().split('GMT')[0].concat("GMT+0530 (GMT+05:30)"),
        end: moment(req.body.end, 'DD/MM/YYYY HH:mm').toDate().toString().split('GMT')[0].concat("GMT+0530 (GMT+05:30)")
    };

    // Validate the body again schema
    const schemaValidate = validateJson('editDiscount', discountDoc);
    if(!schemaValidate.result){
        res.status(400).json(schemaValidate.errors);
        return;
    }

    // Check start is after today
    if(moment(new Date(discountDoc.start)).isBefore(new Date())){
        res.status(400).json({ message: 'Discount start date needs to be after today' });
        return;
    }

    // Check end is after the start
    if(!moment(new Date(discountDoc.end)).isAfter(new Date(discountDoc.start))){
        res.status(400).json({ message: 'Discount end date needs to be after start date' });
        return;
    }

    // Check if code exists
    const checkCode = await db.discounts.countDocuments({
        code: discountDoc.code,
        _id: { $ne: common.getId(discountDoc.discountId) }
    });
    if(checkCode){
        res.status(400).json({ message: 'Discount code already exists' });
        return;
    }

    // Remove discountID
    delete discountDoc.discountId;

    try{
        await db.discounts.updateOne({ _id: common.getId(req.body.discountId) }, { $set: discountDoc }, {});
        res.status(200).json({ message: 'Successfully saved', discount: discountDoc });
    }catch(ex){
        res.status(400).json({ message: 'Failed to save. Please try again' });
    }
});

// Create a discount code
router.get('/admin/settings/discount/new', csrfProtection, restrict, checkAccess, async (req, res) => {
    res.render('settings-discount-new', {
        title: 'Discount code create',
        session: req.session,
        admin: true,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config,
        csrfToken: req.csrfToken()
    });
});

// Create a discount code
router.post('/admin/settings/discount/create', csrfProtection, restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    // Doc to insert
    const discountDoc = {
        code: req.body.code,
        type: req.body.type,
        value: parseInt(req.body.value),
        minimum:parseInt(req.body.minimum),
        new:req.body.new,
        isHide: common.convertBool(req.body.hide),
        onceUsed: common.convertBool(req.body.onlyonce),
        onceUser: common.convertBool(req.body.onceUser),
        start: moment(req.body.start, 'DD/MM/YYYY HH:mm').toDate().toString().split('GMT')[0].concat("GMT+0530 (GMT+05:30)"),
        end: moment(req.body.end, 'DD/MM/YYYY HH:mm').toDate().toString().split('GMT')[0].concat("GMT+0530 (GMT+05:30)")
    };

    // Validate the body again schema
    const schemaValidate = validateJson('newDiscount', discountDoc);
    if(!schemaValidate.result){
        res.status(400).json(schemaValidate.errors);
        return;
    }

    // Check if code exists
    const checkCode = await db.discounts.countDocuments({
        code: discountDoc.code
    });
    if(checkCode){
        res.status(400).json({ message: 'Discount code already exists' });
        return;
    }

    // Check start is after today
    if(moment(new Date(discountDoc.start)).isBefore(new Date())){
        res.status(400).json({ message: 'Discount start date needs to be after today' });
        return;
    }

    // Check end is after the start
    if(!moment(new Date(discountDoc.end)).isAfter(new Date(discountDoc.start))){
        res.status(400).json({ message: 'Discount end date needs to be after start date' });
        return;
    }

    // Insert discount code
    const discount = await db.discounts.insertOne(discountDoc);

    res.status(200).json({ message: 'Discount code created successfully', discountId: discount.insertedId });
});

// Delete discount code
router.delete('/admin/settings/discount/delete', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    try{
        await db.discounts.deleteOne({ _id: common.getId(req.body.discountId) }, {});
        res.status(200).json({ message: 'Discount code successfully deleted' });
        return;
    }catch(ex){
        res.status(400).json({ message: 'Error deleting discount code. Please try again.' });
    }
});
router.post('/setpinlocation',(req,res)=>{
    if(!req.body.pincode) {
        res.status(400).json({message: "Enter Correct Pincode"});
        return;
    }
    var pincode = req.body.pincode;
    if(pincode.length != 6) {
        res.status(400).json({message: "Pincode Length is Not 6"});
        return;
    }
    try {
        pincode = Number(pincode);
        req.session.locationpincode = pincode;
        for(var i=0;i<nurserydata.length;i++) {
            if(nurserydata["pincode"] == pincode) {
                req.session.nurseryid = nurserydata[id];
                break;
            }
        }
        res.status(200).json({message: "Pincode is set"});
        return;
    }
    catch (ex) {
        res.status(400).json({message: "Pincode Should be Number"});
        return;
    }
});
// upload the file
const upload = multer({ dest: 'public/uploads/' });
router.post('/admin/file/upload', restrict, checkAccess, upload.single('uploadFile'), async (req, res) => {
    const db = req.app.db;

    if(req.file){
        const file = req.file;

        // Get the mime type of the file
        const mimeType = mime.lookup(file.originalname);

        // Check for allowed mime type and file size
        console.log(file.size);
        if(!common.allowedMimeType.includes(mimeType) || file.size > common.fileSizeLimit){
            // Remove temp file
            fs.unlinkSync(file.path);

            // Return error
            res.status(400).json({ message: 'File type not allowed or too large. Please try again.' });
            return;
        }

        // get the product form the DB
        const product = await db.products.findOne({ _id: common.getId(req.body.productId) });
        if(!product){
            // delete the temp file.
            fs.unlinkSync(file.path);

            // Return error
            res.status(400).json({ message: 'Product Not found. Please try again.' });
            return;
        }
        var origpath = path.resolve(file.path,file.originalname);
        console.log(origpath);
        console.log("original name\n \n");
        console.log(path.resolve(__filename),"\n",path.resolve(__dirname));
        
        cloudinary.uploader.upload(file.path,{ resource_type: "auto" },
        async function(error, result) {
            if(result){
                var json_String = JSON.stringify(result);
                var obj = JSON.parse(json_String);
                var urlimagepath = obj.secure_url;
                var image_id = obj.public_id;
                if(!urlimagepath){
                    urlimagepath = obj.url;
                }
                var imageArray = [];
                var img_obj = {};
                img_obj.id = image_id;
                img_obj.path = urlimagepath;
                if(!product.productImage){
                    imageArray.push(img_obj)
                    await db.products.updateOne({ _id: common.getId(req.body.productId) }, { $set: { productImage: imageArray } });
                }
                else{
                    await db.products.updateOne({ _id: common.getId(req.body.productId) }, { $push: { productImage: img_obj } });
                }
                fs.unlinkSync(file.path);
                var str = "File uploaded successfully";
                res.status(200).json({ message:  str});
            }
            else {
                console.log(error);
                fs.unlinkSync(file.path);
                res.status(400).json({ message: 'File upload error. Please try again.' });
                return;
            }
        });
        // Return success message
        return;
    }
    // Return error
    res.status(400).json({ message: 'File Not Found error. Please try again.' });
});

// delete a file via ajax request
router.post('/admin/testEmail', restrict, (req, res) => {
    const config = req.app.config;
    // TODO: Should fix this to properly handle result
    common.sendEmail(config.emailAddress, 'expressCart test email', 'Your email settings are working');
    res.status(200).json({ message: 'Test email sent' });
});

router.post('/admin/searchall', restrict, async (req, res, next) => {
    const db = req.app.db;
    const searchValue = req.body.searchValue;
    const limitReturned = 5;

    // Empty arrays
    let customers = [];
    let orders = [];
    let products = [];

    // Default queries
    const customerQuery = {};
    const orderQuery = {};
    const productQuery = {};

    // If an ObjectId is detected use that
    if(ObjectId.isValid(req.body.searchValue)){
        // Get customers
        customers = await db.customers.find({
            _id: ObjectId(searchValue)
        })
        .limit(limitReturned)
        .sort({ created: 1 })
        .toArray();

        // Get orders
        orders = await db.orders.find({
            _id: ObjectId(searchValue)
        })
        .limit(limitReturned)
        .sort({ orderDate: 1 })
        .toArray();

        // Get products
        products = await db.products.find({
            _id: ObjectId(searchValue)
        })
        .limit(limitReturned)
        .sort({ productAddedDate: 1 })
        .toArray();

        return res.status(200).json({
            customers,
            orders,
            products
        });
    }

    // If email address is detected
    if(emailRegex.test(req.body.searchValue)){
        customerQuery.email = searchValue;
        orderQuery.orderEmail = searchValue;
    }else if(numericRegex.test(req.body.searchValue)){
        // If a numeric value is detected
        orderQuery.amount = req.body.searchValue;
        productQuery.productPrice = req.body.searchValue;
    }else{
        // String searches
        customerQuery.$or = [
            { firstName: { $regex: new RegExp(searchValue, 'img') } },
            { lastName: { $regex: new RegExp(searchValue, 'img') } }
        ];
        orderQuery.$or = [
            { orderFirstname: { $regex: new RegExp(searchValue, 'img') } },
            { orderLastname: { $regex: new RegExp(searchValue, 'img') } }
        ];
        productQuery.$or = [
            { productTitle: { $regex: new RegExp(searchValue, 'img') } },
            { productDescription: { $regex: new RegExp(searchValue, 'img') } }
        ];
    }

    // Get customers
    if(Object.keys(customerQuery).length > 0){
        customers = await db.customers.find(customerQuery)
        .limit(limitReturned)
        .sort({ created: 1 })
        .toArray();
    }

    // Get orders
    if(Object.keys(orderQuery).length > 0){
        orders = await db.orders.find(orderQuery)
        .limit(limitReturned)
        .sort({ orderDate: 1 })
        .toArray();
    }

    // Get products
    if(Object.keys(productQuery).length > 0){
        products = await db.products.find(productQuery)
        .limit(limitReturned)
        .sort({ productAddedDate: 1 })
        .toArray();
    }

    return res.status(200).json({
        customers,
        orders,
        products
    });
});

module.exports = router;
