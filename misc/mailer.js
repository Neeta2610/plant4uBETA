const nodemailer=require('nodemailer');
const config = require('../config/mailer');

const transport = nodemailer.createTransport({
    service:'Mailgun',
    auth:{
        user: config.MAILGUN_USER,
        pass: config.MAILGUN_PASS,
    },
    tls:
    {
        rejectUnauthorized :false
    }
});

module.exports ={
     sendEmail(from, to, subject, html,attachment) {
     return new Promise((resolve, reject) => {
        transport.sendMail({ from: from, to:to,subject:subject,text:html,attachments: attachment,function (err, info) {
            if (err){
                console.log(err);
                reject(err);
            } 
            resolve(info);
        }
    });
    });
}
}