const express = require('express');
const common = require('../lib/common');
const { restrict } = require('../lib/auth');
const colors = require('colors');
const bcrypt = require('bcryptjs');
const { validateJson } = require('../lib/schema');
const router = express.Router();

router.get('/admin/users', restrict, async (req, res) => {
    const db = req.app.db;
    const users = await db.users.find({}, { projection: { userPassword: 0 } }).toArray();

    if(req.apiAuthenticated){
        res.status(200).json(users);
        return;
    }

    res.render('users', {
        title: 'Users',
        users: users,
        admin: true,
        config: req.app.config,
        isAdmin: req.session.isAdmin,
        helpers: req.handlebars.helpers,
        session: req.session,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType')
    });
});


// edit user
router.get('/admin/user/edit/:id', restrict, async (req, res) => {
    const db = req.app.db;
    const user = await db.users.findOne({ _id: common.getId(req.params.id) });

    // Check user is found
    if(!user){
        if(req.apiAuthenticated){
            res.status(400).json({ message: 'User not found' });
            return;
        }

        req.session.message = 'User not found';
        req.session.messageType = 'danger';
        res.redirect('/admin/users');
        return;
    }

    // if the user we want to edit is not the current logged in user and the current user is not
    // an admin we render an access denied message
    if(user.userEmail !== req.session.user && req.session.isAdmin === false){
        if(req.apiAuthenticated){
            res.status(400).json({ message: 'Access denied' });
            return;
        }

        req.session.message = 'Access denied';
        req.session.messageType = 'danger';
        res.redirect('/admin/users');
        return;
    }

    res.render('user-edit', {
        title: 'User edit',
        user: user,
        admin: true,
        session: req.session,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config
    });
});

// users new
router.get('/admin/user/new', restrict, (req, res) => {
    res.render('user-new', {
        title: 'User - New',
        admin: true,
        session: req.session,
        helpers: req.handlebars.helpers,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        config: req.app.config
    });
});

// delete a user
router.post('/admin/user/delete', restrict, async (req, res) => {
    const db = req.app.db;

    // userId
    if(req.session.isAdmin !== true){
        res.status(400).json({ message: 'Access denied' });
        return;
    }

    // Cannot delete your own account
    if(req.session.userId === req.body.userId){
        res.status(400).json({ message: 'Unable to delete own user account' });
        return;
    }

    const user = await db.users.findOne({ _id: common.getId(req.body.userId) });

    // If user is not found
    if(!user){
        res.status(400).json({ message: 'User not found.' });
        return;
    }

    // Cannot delete the original user/owner
    if(user.isOwner){
        res.status(400).json({ message: 'Access denied.' });
        return;
    }

    try{
        await db.users.deleteOne({ _id: common.getId(req.body.userId) }, {});
        res.status(200).json({ message: 'User deleted.' });
        return;
    }catch(ex){
        console.log('Failed to delete user', ex);
        res.status(200).json({ message: 'Cannot delete user' });
        return;
    };
});

// update a user
router.post('/admin/user/update', restrict, async (req, res) => {
    const db = req.app.db;

    let isAdmin = req.body.userAdmin === 'on';

    // get the user we want to update
    const user = await db.users.findOne({ _id: common.getId(req.body.userId) });

    // If user not found
    if(!user){
        res.status(400).json({ message: 'User not found' });
        return;
    }

    // If the current user changing own account ensure isAdmin retains existing
    if(user.userEmail === req.session.user){
        isAdmin = user.isAdmin;
    }

    // if the user we want to edit is not the current logged in user and the current user is not
    // an admin we render an access denied message
    if(user.userEmail !== req.session.user && req.session.isAdmin === false){
        res.status(400).json({ message: 'Access denied' });
        return;
    }

    // create the update doc
    const updateDoc = {};
    updateDoc.isAdmin = isAdmin;
    if(req.body.usersName){
        updateDoc.usersName = req.body.usersName;
    }
    if(req.body.userEmail){
        updateDoc.userEmail = req.body.userEmail;
    }
    if(req.body.userPassword){
        updateDoc.userPassword = bcrypt.hashSync(req.body.userPassword);
    }

    // Validate update user
    const schemaResult = validateJson('editUser', updateDoc);
    if(!schemaResult.result){
        res.status(400).json({
            message: 'Failed to create user. Check inputs.',
            error: schemaResult.errors
        });
        return;
    }

    try{
        const updatedUser = await db.users.findOneAndUpdate(
            { _id: common.getId(req.body.userId) },
            {
                $set: updateDoc
            }, { multi: false, returnOriginal: false }
        );

        const returnUser = updatedUser.value;
        delete returnUser.userPassword;
        delete returnUser.apiKey;
        res.status(200).json({ message: 'User account updated', user: updatedUser.value });
        return;
    }catch(ex){
        console.error(colors.red('Failed updating user: ' + ex));
        res.status(400).json({ message: 'Failed to update user' });
    }
});

// insert a user
router.post('/admin/user/insert', restrict, async (req, res) => {
    const db = req.app.db;

    // Check number of users
    const userCount = await db.users.countDocuments({});
    let isAdmin = false;

    // if no users, setup user as admin
    if(userCount === 0){
        isAdmin = true;
    }

    const userObj = {
        usersName: req.body.usersName,
        userEmail: req.body.userEmail,
        userPassword: bcrypt.hashSync(req.body.userPassword, 10),
        isAdmin: isAdmin
    };

    // Validate new user
    const schemaResult = validateJson('newUser', userObj);
    if(!schemaResult.result){
        res.status(400).json({ message: 'Failed to create user. Check inputs.', error: schemaResult.errors });
        return;
    }

    // check for existing user
    const user = await db.users.findOne({ userEmail: req.body.userEmail });
    if(user){
        console.error(colors.red('Failed to insert user, possibly already exists'));
        res.status(400).json({ message: 'A user with that email address already exists' });
        return;
    }
    // email is ok to be used.
    try{
        const newUser = await db.users.insertOne(userObj);
        res.status(200).json({
            message: 'User account inserted',
            userId: newUser.insertedId
        });
    }catch(ex){
        console.error(colors.red('Failed to insert user: ' + ex));
        res.status(400).json({ message: 'New user creation failed' });
    }
});

// Vendor Section
router.get('/admin/vendors', restrict, async (req, res) => {
    const db = req.app.db;
    const vendors = await db.vendors.find({}, { projection: { vendorPassword: 0 } }).toArray();

    if(req.apiAuthenticated){
        res.status(200).json(vendors);
        return;
    }

    res.render('vendors', {
        title: 'vendors',
        vendors: vendors,
        admin: true,
        config: req.app.config,
        isAdmin: req.session.isAdmin,
        helpers: req.handlebars.helpers,
        session: req.session,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType')
    });
});


// edit vendor
router.get('/admin/vendor/edit/:id', restrict, async (req, res) => {
    const db = req.app.db;
    const vendor = await db.vendors.findOne({ _id: common.getId(req.params.id) });

    // Check vendor is found
    if(!vendor){
        if(req.apiAuthenticated){
            res.status(400).json({ message: 'vendor not found' });
            return;
        }

        req.session.message = 'vendor not found';
        req.session.messageType = 'danger';
        res.redirect('/admin/vendors');
        return;
    }

    // if the vendor we want to edit is not the current logged in vendor and the current vendor is not
    // an admin we render an access denied message
    if(vendor.vendorEmail !== req.session.vendor && req.session.isAdmin === false){
        if(req.apiAuthenticated){
            res.status(400).json({ message: 'Access denied' });
            return;
        }

        req.session.message = 'Access denied';
        req.session.messageType = 'danger';
        res.redirect('/admin/vendors');
        return;
    }

    res.render('vendor-edit', {
        title: 'vendor edit',
        user: vendor,
        admin: true,
        session: req.session,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        config: req.app.config
    });
});

// vendors new
router.get('/admin/vendor/new', restrict, (req, res) => {
    res.render('vendor-new', {
        title: 'vendor - New',
        admin: true,
        session: req.session,
        helpers: req.handlebars.helpers,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        config: req.app.config
    });
});

// delete a vendor
router.post('/admin/vendor/delete', restrict, async (req, res) => {
    const db = req.app.db;

    // vendorId
    if(req.session.isAdmin !== true){
        res.status(400).json({ message: 'Access denied' });
        return;
    }

    

    const vendor = await db.vendors.findOne({ _id: common.getId(req.body.vendorId) });

    // If vendor is not found
    if(!vendor){
        res.status(400).json({ message: 'vendor not found.' });
        return;
    }

    // Cannot delete the original vendor/owner
    if(vendor.isOwner){
        res.status(400).json({ message: 'Access denied.' });
        return;
    }

    try{
        await db.vendors.deleteOne({ _id: common.getId(req.body.vendorId) }, {});
        res.status(200).json({ message: 'vendor deleted.' });
        return;
    }catch(ex){
        console.log('Failed to delete vendor', ex);
        res.status(200).json({ message: 'Cannot delete vendor' });
        return;
    };
});

// update a vendor
router.post('/admin/vendor/update', restrict, async (req, res) => {
    const db = req.app.db;

    

    // get the vendor we want to update
    const vendor = await db.vendors.findOne({ _id: common.getId(req.body.userId) });

    // If vendor not found
    if(!vendor){
        res.status(400).json({ message: 'vendor not found' });
        return;
    }


    // create the update doc
    const updateDoc = {};
  
    if(req.body.userName){
        updateDoc.userName = req.body.userName;
    }
    if(req.body.userEmail){
        updateDoc.userEmail = req.body.userEmail;
    }
    if(req.body.userPhone){
        updateDoc.userPhone = req.body.userPhone;
    }
    if(req.body.userAddress){
        updateDoc.userAddress = req.body.userAddress;
    }
    if(req.body.userPassword){
        updateDoc.userPassword = bcrypt.hashSync(req.body.userPassword);
    }

    try{
        const updatedvendor = await db.vendors.findOneAndUpdate(
            { _id: common.getId(req.body.userId) },
            {
                $set: updateDoc
            }, { multi: false, returnOriginal: false }
        );
        res.status(200).json({ message: 'vendor account updated', vendor: updatedvendor.value });
        return;
    }catch(ex){
        console.error(colors.red('Failed updating vendor: ' + ex));
        res.status(400).json({ message: 'Failed to update vendor' });
    }
});

// insert a vendor
router.post('/admin/vendor/insert', restrict, async (req, res) => {
    const db = req.app.db;

    // Check number of vendors
    const vendorCount = await db.vendors.countDocuments({});
    let isAdmin = false;

    // if no vendors, setup vendor as admin
    if(vendorCount === 0){
        isAdmin = true;
    }

    const vendorObj = {
        userName: req.body.userName,
        userEmail: req.body.userEmail,
        userPhone: req.body.userPhone,
        userPassword: bcrypt.hashSync(req.body.userPassword, 10)
    };

    // Validate new vendor
    // const schemaResult = validateJson('newvendor', vendorObj);
    // if(!schemaResult.result){
    //     res.status(400).json({ message: 'Failed to create vendor. Check inputs.', error: schemaResult.errors });
    //     return;
    // }

    // check for existing vendor
    const vendor = await db.vendors.findOne({ userEmail: req.body.userEmail });
    if(vendor){
        console.error(colors.red('Failed to insert vendor, possibly already exists'));
        res.status(400).json({ message: 'A vendor with that email address already exists' });
        return;
    }
    // email is ok to be used.
    try{
        const newvendor = await db.vendors.insertOne(vendorObj);
        res.status(200).json({
            message: 'vendor account inserted',
            vendorId: newvendor.insertedId
        });
    }catch(ex){
        console.error(colors.red('Failed to insert vendor: ' + ex));
        res.status(400).json({ message: 'New vendor creation failed' });
    }
});

module.exports = router;
