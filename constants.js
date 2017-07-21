import google from 'googleapis';

const OAuth2 = google.auth.OAuth2;
const calendar = google.calendar('v3');

const messageConfirmation = (confirmation, cancellation) => ({
  "text": "Is this correct?",
  "type": "message",
  "attachments": [
    {
      "text": "Is this correct?",
      "fallback": "Correct details?",
      "callback_id": "meeting_confirmation",
      "color": "#3AA3E3",
      "attachment_type": "default",
      "actions": [
        {
          "name": "yes",
          "text": "Yes",
          "type": "button",
          "value": confirmation
        },
        {
          "name": "no",
          "text": "No",
          "type": "button",
          "value": cancellation
        }
      ]
    }
  ]
});

const getGoogleAuth = () => {
  return new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    // 'http://localhost:3000/connect/callback'
    'http://glacial-shelf-50059.herokuapp.com/connect/callback'
  );
};

const getQueryParams = (msg, sessionId) => ({
  v: 20150910,
  lang: 'en',
  timezone: '2017-07-18T15:32:48-0700',
  query: msg,
  sessionId: sessionId
});

const getFreeBusy = (auth, timeMin, timeMax, id) => (
  new Promise( (resolve, reject) => {
    calendar.freebusy.query({
      auth: auth,
      resource: {
        timeMin: timeMin,
        timeMax: timeMax,
        items: [{
          id: id
        }]
      }
    }, (err, result) => {
      if(err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  })
);

export { messageConfirmation, getQueryParams, getGoogleAuth, getFreeBusy };
