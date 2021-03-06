/**
 * @license
 * Copyright (C) 2019 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import '../../test/common-test-setup-karma.js';
import '../../elements/shared/gr-rest-api-interface/gr-rest-api-interface.js';
import {GrReviewerSuggestionsProvider, SUGGESTIONS_PROVIDERS_USERS_TYPES} from './gr-reviewer-suggestions-provider.js';
import {appContext} from '../../services/app-context.js';

suite('GrReviewerSuggestionsProvider tests', () => {
  let _nextAccountId = 0;
  const makeAccount = function(opt_status) {
    const accountId = ++_nextAccountId;
    return {
      _account_id: accountId,
      name: 'name ' + accountId,
      email: 'email ' + accountId,
      status: opt_status,
    };
  };
  let _nextAccountId2 = 0;
  const makeAccount2 = function(opt_status) {
    const accountId2 = ++_nextAccountId2;
    return {
      _account_id: accountId2,
      name: 'name ' + accountId2,
      status: opt_status,
    };
  };

  let owner;
  let existingReviewer1;
  let existingReviewer2;
  let suggestion1;
  let suggestion2;
  let suggestion3;
  let restAPI;
  let provider;

  let redundantSuggestion1;
  let redundantSuggestion2;
  let redundantSuggestion3;
  let change;

  setup(done => {
    owner = makeAccount();
    existingReviewer1 = makeAccount();
    existingReviewer2 = makeAccount();
    suggestion1 = {account: makeAccount()};
    suggestion2 = {account: makeAccount()};
    suggestion3 = {
      group: {
        id: 'suggested group id',
        name: 'suggested group',
      },
    };

    stub('gr-rest-api-interface', {
      getLoggedIn() { return Promise.resolve(true); },
      getConfig() { return Promise.resolve({}); },
    });

    restAPI = appContext.restApiService;
    change = {
      _number: 42,
      owner,
      reviewers: {
        CC: [existingReviewer1],
        REVIEWER: [existingReviewer2],
      },
    };

    return flush(done);
  });

  suite('allowAnyUser set to false', () => {
    setup(done => {
      provider = GrReviewerSuggestionsProvider.create(restAPI, change._number,
          SUGGESTIONS_PROVIDERS_USERS_TYPES.REVIEWER);
      provider.init().then(done);
    });
    suite('stubbed values for _getReviewerSuggestions', () => {
      setup(() => {
        stub('gr-rest-api-interface', {
          getChangeSuggestedReviewers() {
            redundantSuggestion1 = {account: existingReviewer1};
            redundantSuggestion2 = {account: existingReviewer2};
            redundantSuggestion3 = {account: owner};
            return Promise.resolve([redundantSuggestion1, redundantSuggestion2,
              redundantSuggestion3, suggestion1, suggestion2, suggestion3]);
          },
        });
      });

      test('makeSuggestionItem formats account or group accordingly', () => {
        let account = makeAccount();
        const account3 = makeAccount2();
        let suggestion = provider.makeSuggestionItem({account});
        assert.deepEqual(suggestion, {
          name: account.name + ' <' + account.email + '>',
          value: {account},
        });

        const group = {name: 'test'};
        suggestion = provider.makeSuggestionItem({group});
        assert.deepEqual(suggestion, {
          name: group.name + ' (group)',
          value: {group},
        });

        suggestion = provider.makeSuggestionItem(account);
        assert.deepEqual(suggestion, {
          name: account.name + ' <' + account.email + '>',
          value: {account, count: 1},
        });

        suggestion = provider.makeSuggestionItem({account: {}});
        assert.deepEqual(suggestion, {
          name: 'Anonymous',
          value: {account: {}},
        });

        provider._config = {
          user: {
            anonymous_coward_name: 'Anonymous Coward Name',
          },
        };

        suggestion = provider.makeSuggestionItem({account: {}});
        assert.deepEqual(suggestion, {
          name: 'Anonymous Coward Name',
          value: {account: {}},
        });

        account = makeAccount('OOO');

        suggestion = provider.makeSuggestionItem({account});
        assert.deepEqual(suggestion, {
          name: account.name + ' <' + account.email + '> (OOO)',
          value: {account},
        });

        suggestion = provider.makeSuggestionItem(account);
        assert.deepEqual(suggestion, {
          name: account.name + ' <' + account.email + '> (OOO)',
          value: {account, count: 1},
        });

        account3.email = undefined;

        suggestion = provider.makeSuggestionItem(account3);
        assert.deepEqual(suggestion, {
          name: account3.name,
          value: {account: account3, count: 1},
        });
      });

      test('getSuggestions', done => {
        provider.getSuggestions()
            .then(reviewers => {
              // Default is no filtering.
              assert.equal(reviewers.length, 6);
              assert.deepEqual(reviewers,
                  [redundantSuggestion1, redundantSuggestion2,
                    redundantSuggestion3, suggestion1,
                    suggestion2, suggestion3]);
            })
            .then(done);
      });

      test('getSuggestions short circuits when logged out', () => {
        // API call is already stubbed.
        const xhrSpy = restAPI.getChangeSuggestedReviewers;
        provider._loggedIn = false;
        return provider.getSuggestions('').then(() => {
          assert.isFalse(xhrSpy.called);
          provider._loggedIn = true;
          return provider.getSuggestions('').then(() => {
            assert.isTrue(xhrSpy.called);
          });
        });
      });
    });

    test('getChangeSuggestedReviewers is used', done => {
      const suggestReviewerStub =
          sinon.stub(restAPI, 'getChangeSuggestedReviewers')
              .returns(Promise.resolve([]));
      const suggestAccountStub =
          sinon.stub(restAPI, 'getSuggestedAccounts')
              .returns(Promise.resolve([]));

      provider.getSuggestions('').then(() => {
        assert.isTrue(suggestReviewerStub.calledOnce);
        assert.isTrue(suggestReviewerStub.calledWith(42, ''));
        assert.isFalse(suggestAccountStub.called);
        done();
      });
    });
  });

  suite('allowAnyUser set to true', () => {
    setup(done => {
      provider = GrReviewerSuggestionsProvider.create(restAPI, change._number,
          SUGGESTIONS_PROVIDERS_USERS_TYPES.ANY);
      provider.init().then(done);
    });

    test('getSuggestedAccounts is used', done => {
      const suggestReviewerStub =
          sinon.stub(restAPI, 'getChangeSuggestedReviewers')
              .returns(Promise.resolve([]));
      const suggestAccountStub =
          sinon.stub(restAPI, 'getSuggestedAccounts')
              .returns(Promise.resolve([]));

      provider.getSuggestions('').then(() => {
        assert.isFalse(suggestReviewerStub.called);
        assert.isTrue(suggestAccountStub.calledOnce);
        assert.isTrue(suggestAccountStub.calledWith('cansee:42 '));
        done();
      });
    });
  });
});

