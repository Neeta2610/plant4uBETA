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

module.exports.sendEmail = function(from, to, subject, html) {
        transport.sendMail({
            from: from,
            to: to,
            subject: subject,
            html: html,
            function(err, info) {
              if (err) {
                console.error(err);
                return;
              } else {
                console.log(info);
                return;
              }
            }
          });
}
module.exports.sendEmailattachment = function(from, to, subject, html,attachment) {
        transport.sendMail({
            from: from,
            to: to,
            subject: subject,
            text: html,
            attachments: attachment,
            function(err, info) {
              if (err) {
                console.error(err);
                return;
              } else {
                console.log(info);
                return;
              }
            }
          });
}