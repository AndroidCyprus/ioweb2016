/**
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

window.IOWA = window.IOWA || {};

IOWA.Auth = IOWA.Auth || (function() {
  'use strict';

  var pendingResolutions = [];

  function getTokenResponse_() {
    if (IOWA.Elements.GoogleSignIn.auth2) {
      var user = IOWA.Elements.GoogleSignIn.auth2.currentUser.get();
      if (user.isSignedIn()) {
        return user.getAuthResponse();
      }
    } else if (gapi.auth) {
      return gapi.auth.getToken();
    }
    return null;
  }

  function setUserUI(user) {
    var drawerProfilePic = IOWA.Elements.Drawer.querySelector('.profilepic');
    drawerProfilePic.src = user.picture;
    drawerProfilePic.hidden = false;
  }

  function clearUserUI() {
    var drawerProfilePic = IOWA.Elements.Drawer.querySelector('.profilepic');
    drawerProfilePic.hidden = true;

    var signInButton = IOWA.Elements.Nav.querySelector('.button-link');
    signInButton.removeAttribute('disabled');
  }

  document.addEventListener('signin-change', function(e) {
    if (e.detail.user) {
      // Authorize the user to Firebase.
      var user = e.detail.user;
      IOWA.IOFirebase.auth(user.id, user.tokenResponse.access_token).then(() => {
        setUserUI(user);

        // Call the resolve() function for each of the promises that are waiting on being signed in,
        // and remove each from the queue.
        while (pendingResolutions.length) {
          var pendingResolution = pendingResolutions.shift();
          pendingResolution();
        }

        // If the user hasn't denied notifications permission in the current browser,
        // and the user has notifications turned on globally (i.e. in at least one other browser),
        // and there isn't already a subscription in the current browser, then try to enable
        // notifications in the current browser.
        if (window.Notification.permission !== 'denied') {
          IOWA.Notifications.isNotifyEnabledPromise().then(function(isGlobalNotificationsEnabled) {
            if (isGlobalNotificationsEnabled) {
              IOWA.Notifications.isExistingSubscriptionPromise().then(function(isLocalSubscription) {
                if (!isLocalSubscription) {
                  IOWA.Notifications.subscribePromise();
                }
              });
            }
          });
        }
      });
    } else {
      clearUserUI();
      if (IOWA.Notifications.isSupported) {
        // This kicks off an async network request, wrapped in a promise.
        // If the user has signed out, then we want to unsubscribe from the
        // browser's push manager
        IOWA.Notifications.unsubscribeFromPushManagerPromise();
      }

      // Clear any requests in the SW cache that might have user-specific data.
      // Chrome 43 adds support for the Cache Storage API in the window scope, but we can't rely
      // on that being present, so we have to ask the SW clear out the cache.
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('clear-cached-user-data');
      }

      IOWA.IOFirebase.unAuth();
    }
  });

  document.addEventListener('signin-fail', function(e) {
    clearUserUI();
    if (e.detail.oneTimeCodeFail) {
      IOWA.Analytics.trackError('login', 'error', e.detail.error);
    }
  });

  /**
   * Provides a Promise resolved after the user has signed in.
   * It's useful when delaying activities that can't take place until after the user signs in.
   *
   * Usage:
   * function someUIButtonClicked() {
   *   IOWA.Auth.waitForSignedIn().then(function() {
   *     // At this point you can do something that requires being signed in.
   *   });
   * }
   *
   * @param {string} message The text displayed in the toast.
   *                         Defaults to 'Please sign in'
   * @return {Promise} Resolves once the user is signed in. Does not reject.
   */
  function waitForSignedIn(message) {
    // If we're already signed in, return a Promise that resolves immediately.
    if (getTokenResponse_() && IOWA.IOFirebase.isAuthed()) {
      return Promise.resolve();
    }

    // If we're not already signed in, then return a Promise which will resolve later on, if/when
    // the 'signin-change' event handler is fired for a signed-in event.
    return new Promise(function(resolve) {
      pendingResolutions.push(resolve);

      if (message) {
        IOWA.Elements.Toast.showMessage(message, null, 'Sign in', function() {
          IOWA.Elements.GoogleSignIn.signIn();
        });
      }
    });
  }

  return {
    getTokenResponse: getTokenResponse_,
    waitForSignedIn: waitForSignedIn
  };
})();
