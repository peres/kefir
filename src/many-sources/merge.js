const {END} = require('../constants');
const {inherit} = require('../utils/objects');
const AbstractPool = require('./abstract-pool');
const never = require('../primary/never');


function Merge(sources) {
  AbstractPool.call(this);
  this._addAll(sources);
  this._initialised = true;
}

inherit(Merge, AbstractPool, {

  _name: 'merge',

  _onEmpty() {
    if (this._initialised) {
      this._send(END);
    }
  }

});

module.exports = function merge(observables) {
  return observables.length === 0 ? never() : new Merge(observables);
};
