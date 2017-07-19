import express from 'express';
var router = express.Router();

import rtm from './bot';

import google from 'googleapis';

const OAuth2 = google.auth.OAuth2;

import { User, Reminder } from './models';
import { getGoogleAuth } from './constants';

const scopes = [
  'https://www.googleapis.com/auth/plus.me',
  'https://www.googleapis.com/auth/calendar'
];

const calendar = google.calendar('v3');

router.post('/slack/interactive', (req, res) => {
  const result = JSON.parse(req.body.payload).actions[0];

  User.findOne({slackId: JSON.parse(req.body.payload).user.id})
    .then((user) => {
      if (!user) {
        console.log("User not found");
      } else {
        console.log(user);
        var googleAuth = getGoogleAuth();
        var pending = JSON.parse(user.pending);
        googleAuth.setCredentials(user.google);
        const event = {
          'description': pending.subject,
          'start': {
            'date': pending.date,
            'timeZone': 'America/Los_Angeles',
          },
          'end': {
            'date': pending.date,
            'timeZone': 'America/Los_Angeles',
          }
        };
        console.log(event);
        var newReminder = new Reminder({
          subject: pending.subject,
          date: pending.date,
          userId: user.slackDmId,
        });
        var currentDate = new Date();
        if(currentDate > user.google.expiry_date) {
          googleAuth.refreshAccessToken(function(err, tokens) {
            user.google = tokens;
            user.save();
          });
        }
        rtm.sendMessage("expired", "D6ACYJS9J");
        newReminder.save();
        calendar.events.insert({
          auth: googleAuth,
          calendarId: 'primary',
          resource: event,
        }, (err, event) => {
          if (err) {
            console.log('There was an error contacting the Calendar service: ' + err);
            return;
          }
          console.log('Event created');
          user.pending = JSON.stringify({});
          user.save();
        });
      }
    });

  res.send(result.value);
});

router.get('/connect', (req, res) => {
  var userId = req.query.user;
  console.log("userId", userId);
  if (! userId) {
    req.status(400).send('Missing id');
  } else{
    User.findById(userId)
      .then((user) => {
        if(!user) {
          res.status(404).send('Cannot find user');
        } else{
        // GOOGLE AUTH STUFF HERE
          var googleauth = getGoogleAuth();

          var url = googleauth.generateAuthUrl({
          // 'online' (default) or 'offline' (gets refresh_token)
            access_type: 'offline',
            prompt: 'consent',
            // If you only need one scope you can pass it as a string
            scope: scopes,
            state: userId

          // Optional property that passes state parameters to redirect URI
          // state: { foo: 'bar' }
          });
          console.log('URL is', url);
          res.redirect(url); // at the end
        }
      });
  }
});

router.get('/connect/callback', (req, res) => {
  // console.log('bitches');
  // res.send('here')
  var googleAuth = getGoogleAuth();
  googleAuth.getToken(req.query.code, (err, tokens) => {
  // Now tokens contains an access_token and an optional refresh_token. Save them.
    if (err) {
      res.status(500).json({error: err});
      // oauth2Client.setCredentials(tokens);
    } else {
      googleAuth.setCredentials(tokens);
      var plus = google.plus('v1');
      plus.people.get({ auth: googleAuth, userId: 'me'}, (err, googleUser) => {
        if(err) {
          res.status(500).json({error: err});
        } else {
          User.findById(req.query.state)
            .then((mongoUser) => {
              console.log("Logging in", googleUser);
              mongoUser.tokens = tokens;
              mongoUser.google = tokens;
              mongoUser.google.profile_id = googleUser.id;
              mongoUser.google.profile_name = googleUser.displayName;
              console.log(mongoUser);
              return mongoUser.save();
            })
            .then((mongoUser) => {
              res.send('You are now connected to Google Calendar API!');
              rtm.sendMessage('You are now connected to Google Calendar API!',
                mongoUser.slackDmId);
            })
            .catch((err) => {
              console.log('Error was', err);
            });
        }
      });
    }
  });
});

export default router;
