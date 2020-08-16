const express = require('express');
const {
    clearSessionValue,
    emptyCart,
    getCountryList,
    getId,
    sendEmail,
    getEmailTemplate,
    clearCustomer,
    paginateData
} = require('../lib/common');
const { restrict, checkAccess } = require('../lib/auth');
const { indexOrders } = require('../lib/indexing');
const router = express.Router();
const mailer=require('../misc/mailer');

// Show orders
router.get('/admin/orders/:page?', restrict, async (req, res, next) => {
    let pageNum = 1;
    if(req.params.page){
        pageNum = req.params.page;
    }

    // Get our paginated data
    const orders = await paginateData(false, req, pageNum, 'orders', {}, { orderDate: -1 });

    // If API request, return json
    if(req.apiAuthenticated){
        res.status(200).json({
            orders
        });
        return;
    }

    res.render('orders', {
        title: 'Cart',
        orders: orders.data,
        totalItemCount: orders.totalItems,
        pageNum,
        paginateUrl: 'admin/orders',
        admin: true,
        config: req.app.config,
        session: req.session,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

// Admin section
router.get('/admin/orders/bystatus/:orderstatus', restrict, async (req, res, next) => {
    const db = req.app.db;

    if(typeof req.params.orderstatus === 'undefined'){
        res.redirect('/admin/orders');
        return;
    }

    // case insensitive search
    const regex = new RegExp(['^', req.params.orderstatus, '$'].join(''), 'i');
    const orders = await db.orders.find({ orderStatus: regex }).sort({ orderDate: -1 }).limit(10).toArray();

    // If API request, return json
    if(req.apiAuthenticated){
        res.status(200).json({
            orders
        });
        return;
    }

    res.render('orders', {
        title: 'Cart',
        orders: orders,
        admin: true,
        filteredOrders: true,
        filteredStatus: req.params.orderstatus,
        config: req.app.config,
        session: req.session,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

// render the editor
router.get('/admin/order/view/:id', restrict, async (req, res) => {
    const db = req.app.db;
    const order = await db.orders.findOne({ _id: getId(req.params.id) });

    res.render('order', {
        title: 'View order',
        result: order,
        config: req.app.config,
        session: req.session,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        editor: true,
        admin: true,
        helpers: req.handlebars.helpers
    });
});

// render the editor
router.get('/admin/order/create', restrict, async (req, res) => {
    res.render('order-create', {
        title: 'Create order',
        config: req.app.config,
        session: req.session,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        countryList: getCountryList(),
        editor: true,
        admin: true,
        helpers: req.handlebars.helpers
    });
});

router.post('/admin/order/create', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;

    // Check if cart is empty
    if(!req.session.cart){
        res.status(400).json({
            message: 'The cart is empty. You will need to add items to the cart first.'
        });
    }

    const orderDoc = {
        orderPaymentId: getId(),
        orderPaymentGateway: 'Instore',
        orderPaymentMessage: 'Your payment was successfully completed',
        orderTotal: req.session.totalCartAmount,
        orderShipping: req.session.totalCartShipping,
        orderItemCount: req.session.totalCartItems,
        orderProductCount: req.session.totalCartProducts,
        orderCustomer: getId(req.session.customerId),
        orderEmail: req.body.email || req.session.customerEmail,
        orderCompany: req.body.company || req.session.customerCompany,
        orderFirstname: req.body.firstName || req.session.customerFirstname,
        orderLastname: req.body.lastName || req.session.customerLastname,
        orderAddr1: req.body.address1 || req.session.customerAddress1,
        orderAddr2: req.body.address2 || req.session.customerAddress2,
        orderCountry: req.body.country || req.session.customerCountry,
        orderState: req.body.state || req.session.customerState,
        orderPostcode: req.body.postcode || req.session.customerPostcode,
        orderPhoneNumber: req.body.phone || req.session.customerPhone,
        orderComment: req.body.orderComment || req.session.orderComment,
        orderStatus: req.body.orderStatus,
        orderDate: new Date(),
        orderProducts: req.session.cart,
        orderType: 'Single'
    };

    // insert order into DB
    try{
        const newDoc = await db.orders.insertOne(orderDoc);

        // get the new ID
        const orderId = newDoc.insertedId;

        // add to lunr index
        indexOrders(req.app)
        .then(() => {
            // set the results
            req.session.messageType = 'success';
            req.session.message = 'Your order was successfully placed. Payment for your order will be completed instore.';
            req.session.paymentEmailAddr = newDoc.ops[0].orderEmail;
            req.session.paymentApproved = true;
            req.session.paymentDetails = `<p><strong>Order ID: </strong>${orderId}</p>
            <p><strong>Transaction ID: </strong>${orderDoc.orderPaymentId}</p>`;

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
                emptyCart(req, res, 'function');
            }

            // Clear customer session
            clearCustomer(req);

            // send the email with the response
            // TODO: Should fix this to properly handle result
            sendEmail(req.session.paymentEmailAddr, `Your order with ${config.cartTitle}`, getEmailTemplate(paymentResults));

            // redirect to outcome
            res.status(200).json({
                message: 'Order created successfully',
                orderId
            });
        });
    }catch(ex){
        res.status(400).json({ err: 'Your order declined. Please try again' });
    }
});

// Admin section
router.get('/admin/orders/filter/:search', restrict, async (req, res, next) => {
    const db = req.app.db;
    const searchTerm = req.params.search;
    const ordersIndex = req.app.ordersIndex;

    const lunrIdArray = [];
    ordersIndex.search(searchTerm).forEach((id) => {
        lunrIdArray.push(getId(id.ref));
    });

    // we search on the lunr indexes
    const orders = await db.orders.find({ _id: { $in: lunrIdArray } }).toArray();

    // If API request, return json
    if(req.apiAuthenticated){
        res.status(200).json({
            orders
        });
        return;
    }

    res.render('orders', {
        title: 'Order results',
        orders: orders,
        admin: true,
        config: req.app.config,
        session: req.session,
        searchTerm: searchTerm,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

// order product
router.get('/admin/order/delete/:id', restrict, async(req, res) => {
    const db = req.app.db;

    // remove the order
    try{
        await db.orders.deleteOne({ _id: getId(req.params.id) });

        // remove the index
        indexOrders(req.app)
        .then(() => {
            if(req.apiAuthenticated){
                res.status(200).json({
                    message: 'Order successfully deleted'
                });
                return;
            }

            // redirect home
            req.session.message = 'Order successfully deleted';
            req.session.messageType = 'success';
            res.redirect('/admin/orders');
        });
    }catch(ex){
        console.log('Cannot delete order', ex);
        if(req.apiAuthenticated){
            res.status(200).json({
                message: 'Error deleting order'
            });
            return;
        }

        // redirect home
        req.session.message = 'Error deleting order';
        req.session.messageType = 'danger';
        res.redirect('/admin/orders');
    }
});

// update order status
router.post('/admin/order/statusupdate', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;
    try{
        await db.orders.updateOne({
            _id: getId(req.body.order_id) },
            { $set: { orderStatus: req.body.status }
        }, { multi: false });
        const order = await db.orders.findOne({_id: getId(req.body.order_id)});
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
                                        <img src="https://www.sparksuite.com/images/logo.png" style="width:100%; max-width:300px;">
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
    await mailer.sendEmail('admin@plant4u.com',order.orderEmail,'Order Complete',html)
        }
        return res.status(200).json({ message: 'Status successfully updated' });
    }catch(ex){
        console.info('Error updating status', ex);
        return res.status(400).json({ message: 'Failed to update the order status' });
    }
});

module.exports = router;
