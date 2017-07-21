import express from 'express';
import axios from 'axios';

const router = express.Router();

import { rtm } from './bot';

import google from 'googleapis';

const OAuth2 = google.auth.OAuth2;

import { User, Reminder } from './models';
import { getGoogleAuth, getFreeBusy } from './constants';

const scopes = [
  'https://www.googleapis.com/auth/calendar',
  'profile',
  'email'
];

const calendar = google.calendar('v3');
/* test44607 */
router.post('/slack/interactive', (req, res) => {
  User.findOne({ slackId: JSON.parse(req.body.payload).user.id })
    .then((user) => {
      if (!user) {
        console.log("User not found");
      } else {
        // console.log(user);
        const googleAuth = getGoogleAuth();
        const pending = JSON.parse(user.pending);
        googleAuth.setCredentials(user.google);
        const currentDate = new Date();
        if (currentDate > user.google.expiry_date) {
          googleAuth.refreshAccessToken((err, tokens) => {
            user.google = tokens;
            user.save();
          });
        }
        if (pending.type === "reminder") {
          const event = {
            'summary': 'Reminder',
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
          const newReminder = new Reminder({
            subject: pending.subject,
            date: pending.date,
            userId: user.slackDmId,
          });
          newReminder
            .save()
            .then(() => {
              calendar.events.insert({
                auth: googleAuth,
                calendarId: 'primary',
                resource: event,
              }, (err) => {
                if (err) {
                  console.log('There was an error contacting the Calendar service: ' + err);
                  return;
                }
                console.log('Event created');
                user.pending = JSON.stringify({});
                user.save();
              });
            });
        } else if (pending.type === "meeting") {
          const attendees = [];
          for(let i = 0; i < pending.ids.length; i++) {
            const object = {};
            const id = pending.ids[i];
            console.log(rtm.dataStore.getUserById(id).profile);
            object.email = rtm.dataStore.getUserById(id).profile.email;
            attendees.push(object);
          }
          const event2 = {
            'summary': 'Meeting',
            'description': pending.type,
            'start': {
              'dateTime': pending.date + 'T' + pending.time + '-07:00',
              'timeZone': 'America/Los_Angeles',
            },
            'end': {
              'dateTime': pending.date + 'T' + pending.time + '-07:00',
              'timeZone': 'America/Los_Angeles',
            },
            'attendees': attendees,
          };
          const busy = [];
          console.log("Before the loop", pending.ids);
          for(let i = 0; i < pending.ids.length; i++) {
            console.log("In for-loop");
            const id = pending.ids[i];
            User.findOne({"slackId": id})
              .then((pendingUser, err) => {
                if(err) {
                  console.log("User not found", err);
                  return;
                }
                const userEmail = rtm.dataStore.getUserById(id).profile.email;
                // console.log(userEmail);
                const userAuth = getGoogleAuth();
                userAuth.setCredentials(pendingUser.google);
                getFreeBusy(userAuth, "2017-07-10T23:44:28.917Z", "2017-07-25T23:44:28.917Z", userEmail)
                  .then((response) => {
                    console.log("Busy times are", userEmail, response.calendars[userEmail].busy);
                    busy.push(response.calendars[userEmail].busy);
                    console.log("THIS IS BUSY", busy);
                    process.busyOutput = busy;
                    console.log("Out of for-loop");
                  })
                  .catch((err2) => {
                    // console.log("Error", err2);
                    console.log("Error is", err2);
                    console.log("Out of for-loop");
                  });
              });
          }

          calendar.events.insert({
            auth: googleAuth,
            calendarId: 'primary',
            resource: event2,
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
      }
    });
  res.send(JSON.parse(req.body.payload).actions[0].value);
});

router.get('/connect', (req, res) => {
  const userId = req.query.user;
  console.log("userId", userId);
  if (!userId) {
    req.status(400).send('Missing id');
  } else {
    User.findById(userId)
      .then((user) => {
        if (!user) {
          res.status(404).send('Cannot find user');
        } else {
          // GOOGLE AUTH STUFF HERE
          const googleauth = getGoogleAuth();

          const url = googleauth.generateAuthUrl({
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
  const googleAuth = getGoogleAuth();
  googleAuth.getToken(req.query.code, (err, tokens) => {
    // Now tokens contains an access_token and an optional refresh_token. Save them.
    if (err) {
      res.status(500).json({ error: err });
      // oauth2Client.setCredentials(tokens);
    } else {
      googleAuth.setCredentials(tokens);
      const plus = google.plus('v1');
      plus.people.get({ auth: googleAuth, userId: 'me' }, (err, googleUser) => {
        if (err) {
          res.status(500).json({ error: err });
        } else {
          User.findById(req.query.state)
            .then((mongoUser) => {
              console.log("Logging in", googleUser);
              mongoUser.tokens = tokens;
              mongoUser.google = tokens;
              mongoUser.google.profile_id = googleUser.id;
              mongoUser.google.profile_name = googleUser.displayName;
              // mongoUser.google.email = mongoUser.emails[0].value;
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