/*! kefir - 0.1.6
 *  https://github.com/pozadi/kefir
 */
(function(global){
  "use strict";

function noop(){}

function id(x){return x}

function own(obj, prop){
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function toArray(arrayLike){
  return Array.prototype.slice.call(arrayLike);
}

function createObj(proto) {
  var F = function(){};
  F.prototype = proto;
  return new F();
}

function extend() {
  var objects = toArray(arguments);
  if (objects.length === 1) {
    return objects[0];
  }
  var result = objects.shift();
  for (var i = 0; i < objects.length; i++) {
    for (var prop in objects[i]) {
      if(own(objects[i], prop)) {
        result[prop] = objects[i][prop];
      }
    }
  }
  return result;
}

function inherit(Child, Parent) { // (Child, Parent[, mixin1, mixin2, ...])
  Child.prototype = createObj(Parent.prototype);
  Child.prototype.constructor = Child;
  for (var i = 2; i < arguments.length; i++) {
    extend(Child.prototype, arguments[i]);
  }
  return Child;
}

function inheritMixin(Child, Parent) {
  for (var prop in Parent) {
    if (own(Parent, prop) && !(prop in Child)) {
      Child[prop] = Parent[prop];
    }
  }
  return Child;
}

function removeFromArray(array, value) {
  for (var i = 0; i < array.length;) {
    if (array[i] === value) {
      array.splice(i, 1);
    } else {
      i++;
    }
  }
}

function killInArray(array, value) {
  for (var i = 0; i < array.length; i++) {
    if (array[i] === value) {
      delete array[i];
    }
  }
}

function isAllDead(array) {
  for (var i = 0; i < array.length; i++) {
    /*jshint eqnull:true */
    if (array[i] != null) {
      return false;
    }
  }
  return true;
}

function firstArrOrToArr(args) {
  if (Object.prototype.toString.call(args[0]) === '[object Array]') {
    return args[0];
  }
  return toArray(args);
}

function restArgs(args, start, nullOnEmpty){
  if (args.length > start) {
    return Array.prototype.slice.call(args, start);
  }
  if (nullOnEmpty) {
    return null;
  } else {
    return [];
  }
}

function callFn(args/*, moreArgs...*/){
  var fn = args[0];
  var context = args[1];
  var bindedArgs = restArgs(args, 2);
  var moreArgs = restArgs(arguments, 1);
  return fn.apply(context, bindedArgs.concat(moreArgs));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertStream(stream){
  assert(stream instanceof Stream, "not a Stream: " + stream)
}

function assertProperty(property){
  assert(property instanceof Property, "not a Property: " + property)
}

function isFn(fn) {
  return typeof fn === "function";
}

function withName(name, obj){
  obj.__objName = name;
  return obj;
}

function isEqualArrays(a, b){
  /*jshint eqnull:true */
  if (a == null && b == null) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}



// Class method names convention
//
// __foo: can be used only inside class or child class
// _foo: can be used only inside Kefir
// foo: public API


var Kefir = {};

var NOTHING = Kefir.NOTHING = ['<nothing>'];
var END = Kefir.END = ['<end>'];
var NO_MORE = Kefir.NO_MORE = ['<no more>'];


// BunchOfValues
//
// Example:
//   stream._send(Kefir.bunch(1, 2, Kefir.END))

Kefir.BunchOfValues = function(values){
  this.values = values;
}
Kefir.bunch = function() {
  return new Kefir.BunchOfValues(firstArrOrToArr(arguments));
}



// Callbacks

var Callbacks = Kefir.Callbacks = function Callbacks(){
  // this.__subscribers = null;
  // this.__contexts = null;
  // this.__arguments = null;
}

inherit(Callbacks, Object, {

  add: function(fn, context /*, args...*/){
    var args = restArgs(arguments, 2, true);
    if (!this.__subscribers) {
      this.__subscribers = [];
    }
    this.__subscribers.push(fn);
    /*jshint eqnull:true */
    if (context != null) {
      if (!this.__contexts) {
        this.__contexts = {};
      }
      this.__contexts[this.__subscribers.length - 1] = context;
    }
    if (args != null) {
      if (!this.__arguments) {
        this.__arguments = {};
      }
      this.__arguments[this.__subscribers.length - 1] = args;
    }
  },
  remove: function(fn, context /*, args...*/){
    if (this.isEmpty()) {return}
    var args = restArgs(arguments, 2, true);
    for (var i = 0; i < this.__subscribers.length; i++) {
      var sameFn = (this.__subscribers[i] === fn);
      var sameContext = (this.__contexts && this.__contexts[i]) === context;
      var sameArgs = isEqualArrays((this.__arguments && this.__arguments[i]), args);
      if (sameFn && sameContext && sameArgs) {
        delete this.__subscribers[i];
        if (this.__contexts) {
          delete this.__contexts[i];
        }
        if (this.__arguments) {
          delete this.__arguments[i];
        }
      }
    }
    if (isAllDead(this.__subscribers)){
      delete this.__subscribers;
      delete this.__contexts;
      delete this.__arguments;
    }
  },
  isEmpty: function(){
    return !this.__subscribers;
  },
  hasOne: function(){
    return !this.isEmpty() && this.__subscribers.length === 1;
  },
  send: function(x){
    if (this.isEmpty()) {return}
    for (var i = 0, l = this.__subscribers.length; i < l; i++) {
      var callback = this.__subscribers[i];
      var context = (this.__contexts && this.__contexts[i]);
      var args = ((this.__arguments && this.__arguments[i]) || []).concat([x]);
      if (isFn(callback)) {
        if(NO_MORE === callback.apply(context, args)) {
          this.remove(callback, context);
        }
      }
    }
  }

})



// Observable

var Observable = Kefir.Observable = function Observable(onFirstIn, onLastOut){

  // __onFirstIn, __onLastOut can also be added to prototype of child classes
  if (isFn(onFirstIn)) {
    this.__onFirstIn = onFirstIn;
  }
  if (isFn(onLastOut)) {
    this.__onLastOut = onLastOut;
  }

  this.__subscribers = new Callbacks;
  this.__endSubscribers = new Callbacks;

}

inherit(Observable, Object, {

  __ClassName: 'Observable',
  _send: function(x) {
    if (!this.isEnded()) {
      if (x === END) {
        this.__end();
      } else if (x instanceof Kefir.BunchOfValues) {
        for (var i = 0; i < x.values.length; i++) {
          this._send(x.values[i]);
        }
      } else if (x !== Kefir.NOTHING) {
        this.__deliver(x);
      }
    }
  },
  __deliver: function(x){
    if (!this.__subscribers.isEmpty()) {
      this.__subscribers.send(x);
      if (this.__subscribers.isEmpty()) {
        this.__onLastOut();
      }
    }
  },
  on: function(/*callback [, context [, arg1, arg2 ...]]*/) {
    if (!this.isEnded()) {
      this.__subscribers.add.apply(this.__subscribers, arguments);
      if (this.__subscribers.hasOne()) {
        this.__onFirstIn();
      }
    }
  },
  onChanges: function(){
    this.on.apply(this, arguments);
  },
  onValue: function(){
    this.on.apply(this, arguments);
  },
  off: function(/*callback [, context [, arg1, arg2 ...]]*/) {
    if (!this.isEnded()) {
      this.__subscribers.remove.apply(this.__subscribers, arguments);
      if (this.__subscribers.isEmpty()) {
        this.__onLastOut();
      }
    }
  },
  onEnd: function(/*callback [, context [, arg1, arg2 ...]]*/) {
    if (this.isEnded()) {
      callFn(arguments);
    } else {
      this.__endSubscribers.add.apply(this.__endSubscribers, arguments);
    }
  },
  offEnd: function(/*callback [, context [, arg1, arg2 ...]]*/) {
    if (!this.isEnded()){
      this.__endSubscribers.remove.apply(this.__endSubscribers, arguments);
    }
  },
  isEnded: function() {
    return this.__subscribers === null;
  },
  hasSubscribers: function(){
    return !this.isEnded() && !this.__subscribers.isEmpty();
  },
  __onFirstIn: noop,
  __onLastOut: noop,
  __sendEnd: function(){
    this._send(END);
  },
  __end: function() {
    if (!this.isEnded()) {
      this.__onLastOut();
      this.__endSubscribers.send();
      if (own(this, '__onFirstIn')) {
        this.__onFirstIn = null;
      }
      if (own(this, '__onLastOut')) {
        this.__onLastOut = null;
      }
      this.__subscribers = null;
      this.__endSubscribers = null;
    }
  },
  toString: function(){
    return '[' + this.__ClassName + (this.__objName ? (' | ' + this.__objName) : '') + ']';
  }

})




// Stream

var Stream = Kefir.Stream = function Stream(){
  Observable.apply(this, arguments);
}

inherit(Stream, Observable, {
  __ClassName: 'Stream'
})




// Property

var Property = Kefir.Property = function Property(onFirstIn, onLastOut, initial){
  Observable.call(this, onFirstIn, onLastOut);
  this.__cached = (typeof initial !== "undefined") ? initial : Kefir.NOTHING;
}

inherit(Property, Observable, {

  __ClassName: 'Property',
  onChanges: function(){
    Observable.prototype.on.apply(this, arguments);
  },
  on: function(/*callback [, context [, arg1, arg2 ...]]*/) {
    if ( this.hasCached() ) {
      callFn(arguments, this.__cached);
    }
    this.onChanges.apply(this, arguments);
  },
  _send: function(x) {
    if (!this.isEnded()){
      this.__cached = x;
    }
    Observable.prototype._send.call(this, x);
  },
  toProperty: function(initial){
    assert(
      typeof initial === "undefined",
      "can't convert Property to Property with new initial value"
    )
    return this;
  },
  hasCached: function(){
    return this.__cached !== Kefir.NOTHING;
  },
  getCached: function(){
    return this.__cached;
  }

})



// Log

Observable.prototype.log = function(text) {
  function log(value){
    if (text) {
      console.log(text, value);
    } else {
      console.log(value);
    }
  }
  this.on(log);
  this.onEnd(function(){  log(END)  });
}

// TODO
//
// Kefir.constant(x)



// Never

var neverObj = new Stream();
neverObj._send(Kefir.END);
neverObj.__objName = 'Kefir.never()'
Kefir.never = function() {
  return neverObj;
}




// Once

Kefir.OnceStream = function OnceStream(value){
  Stream.call(this);
  this.__value = value;
}

inherit(Kefir.OnceStream, Stream, {

  __ClassName: 'OnceStream',
  __objName: 'Kefir.once(x)',
  __onFirstIn: function(){
    this._send(this.__value);
    this.__value = null;
    this._send(Kefir.END);
  }

})

Kefir.once = function(x) {
  return new Kefir.OnceStream(x);
}





// fromBinder

Kefir.FromBinderStream = function FromBinderStream(subscribe){
  Stream.call(this);
  this.__subscribe = subscribe;
}

inherit(Kefir.FromBinderStream, Stream, {

  __ClassName: 'FromBinderStream',
  __objName: 'Kefir.fromBinder(subscribe)',
  __onFirstIn: function(){
    var _this = this;
    this.__usubscriber = this.__subscribe(function(x){
      _this._send(x);
    });
  },
  __onLastOut: function(){
    if (isFn(this.__usubscriber)) {
      this.__usubscriber();
    }
    this.__usubscriber = null;
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__subscribe = null;
  }

})

Kefir.fromBinder = function(subscribe){
  return new Kefir.FromBinderStream(subscribe);
}

// TODO
//
// stream.skipWhile(f)
// observable.skip(n)
//
// observable.scan(seed, f)
// observable.diff(start, f)
//
// observable.skipDuplicates(isEqual)



var WithSourceStreamMixin = {
  __Constructor: function(source) {
    this.__source = source;
    source.onEnd(this.__sendEnd, this);
    if (source instanceof Property && this instanceof Property && source.hasCached()) {
      this.__handle(source.getCached());
    }
  },
  __handle: function(x){
    this._send(x);
  },
  __onFirstIn: function(){
    this.__source.onChanges(this.__handle, this);
  },
  __onLastOut: function(){
    this.__source.off(this.__handle, this);
  },
  __end: function(){
    this.__source = null;
  }
}





// Stream::toProperty()

Kefir.PropertyFromStream = function PropertyFromStream(source, initial){
  assertStream(source);
  Property.call(this, null, null, initial);
  this.__Constructor.call(this, source);
}

inherit(Kefir.PropertyFromStream, Property, WithSourceStreamMixin, {

  __ClassName: 'PropertyFromStream',
  __objName: 'stream.toProperty()',
  __end: function(){
    Property.prototype.__end.call(this);
    WithSourceStreamMixin.__end.call(this);
  }

})

Stream.prototype.toProperty = function(initial){
  return new Kefir.PropertyFromStream(this, initial);
}





// Property::changes()

Kefir.ChangesStream = function ChangesStream(source){
  assertProperty(source);
  Stream.call(this);
  this.__Constructor.call(this, source);
}

inherit(Kefir.ChangesStream, Stream, WithSourceStreamMixin, {

  __ClassName: 'ChangesStream',
  __objName: 'property.changes()',
  __end: function(){
    Stream.prototype.__end.call(this);
    WithSourceStreamMixin.__end.call(this);
  }

})

Property.prototype.changes = function() {
  return new Kefir.ChangesStream(this);
}






// Map

var MapMixin = {
  __Constructor: function(source, mapFn){
    if (source instanceof Property) {
      Property.call(this);
    } else {
      Stream.call(this);
    }
    this.__mapFn = mapFn;
    WithSourceStreamMixin.__Constructor.call(this, source);
  },
  __handle: function(x){
    this._send( this.__mapFn(x) );
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    WithSourceStreamMixin.__end.call(this);
    this.__mapFn = null;
  }
}
inheritMixin(MapMixin, WithSourceStreamMixin);

Kefir.MappedStream = function MappedStream(){
  this.__Constructor.apply(this, arguments);
}

inherit(Kefir.MappedStream, Stream, MapMixin, {
  __ClassName: 'MappedStream'
});

Kefir.MappedProperty = function MappedProperty(){
  this.__Constructor.apply(this, arguments);
}

inherit(Kefir.MappedProperty, Property, MapMixin, {
  __ClassName: 'MappedProperty'
})

Observable.prototype.map = function(fn) {
  if (this instanceof Property) {
    return new Kefir.MappedProperty(this, fn);
  } else {
    return new Kefir.MappedStream(this, fn);
  }
}






// Filter

var filterMixin = {
  __handle: function(x){
    if (this.__mapFn(x)) {
      this._send(x);
    }
  }
}
inheritMixin(filterMixin, MapMixin);

Kefir.FilteredStream = function FilteredStream(){
  this.__Constructor.apply(this, arguments);
}

inherit(Kefir.FilteredStream, Stream, filterMixin, {
  __ClassName: 'FilteredStream'
})

Kefir.FilteredProperty = function FilteredProperty(){
  this.__Constructor.apply(this, arguments);
}

inherit(Kefir.FilteredProperty, Property, filterMixin, {
  __ClassName: 'FilteredProperty'
})

Observable.prototype.filter = function(fn) {
  if (this instanceof Property) {
    return new Kefir.FilteredProperty(this, fn);
  } else {
    return new Kefir.FilteredStream(this, fn);
  }
}





// TakeWhile

var TakeWhileMixin = {
  __handle: function(x){
    if (this.__mapFn(x)) {
      this._send(x);
    } else {
      this._send(Kefir.END);
    }
  }
}
inheritMixin(TakeWhileMixin, MapMixin);

Kefir.TakeWhileStream = function TakeWhileStream(){
  this.__Constructor.apply(this, arguments);
}

inherit(Kefir.TakeWhileStream, Stream, TakeWhileMixin, {
  __ClassName: 'TakeWhileStream'
})

Kefir.TakeWhileProperty = function TakeWhileProperty(){
  this.__Constructor.apply(this, arguments);
}

inherit(Kefir.TakeWhileProperty, Property, TakeWhileMixin, {
  __ClassName: 'TakeWhileStream'
})

Observable.prototype.takeWhile = function(fn) {
  if (this instanceof Property) {
    return new Kefir.TakeWhileProperty(this, fn);
  } else {
    return new Kefir.TakeWhileStream(this, fn);
  }
}




// Take

Observable.prototype.take = function(n) {
  return withName('observable.take(n)', this.takeWhile(function(){
    return n-- > 0;
  }))
};

// TODO
//
// observable.flatMapLatest(f)
// observable.flatMapFirst(f)
//
// observable.zip(other, f)
//
// observable.awaiting(otherObservable)
//
// stream.concat(otherStream)
//
// Kefir.onValues(a, b [, c...], f)




// var PluggableMixin = {

//   __Constructor: function(){
//     this.__plugged = [];
//   },
//   __handlePlugged: function(i, value){
//     this._send(value);
//   },
//   __end: function(){
//     this.__plugged = null;
//   }


// }





// Bus

Kefir.Bus = function Bus(){
  Stream.call(this);
  this.__plugged = [];
}

inherit(Kefir.Bus, Stream, {

  __ClassName: 'Bus',
  __objName: 'Kefir.bus()',
  push: function(x){
    this._send(x)
  },
  plug: function(stream){
    if (!this.isEnded()) {
      this.__plugged.push(stream);
      if (this.hasSubscribers()) {
        stream.on(this._send, this);
      }
      stream.onEnd(this.unplug, this, stream);
    }
  },
  unplug: function(stream){
    if (!this.isEnded()) {
      stream.off(this._send, this);
      removeFromArray(this.__plugged, stream);
    }
  },
  end: function(){
    this._send(Kefir.END);
  },
  __onFirstIn: function(){
    for (var i = 0; i < this.__plugged.length; i++) {
      this.__plugged[i].on(this._send, this);
    }
  },
  __onLastOut: function(){
    for (var i = 0; i < this.__plugged.length; i++) {
      this.__plugged[i].off(this._send, this);
    }
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__plugged = null;
    this.push = noop;
  }

});

Kefir.bus = function(){
  return new Kefir.Bus;
}





// FlatMap

Kefir.FlatMappedStream = function FlatMappedStream(sourceStream, mapFn){
  Stream.call(this)
  this.__sourceStream = sourceStream;
  this.__plugged = [];
  this.__mapFn = mapFn;
  sourceStream.onEnd(this.__sendEnd, this);
}

inherit(Kefir.FlatMappedStream, Stream, {

  __ClassName: 'FlatMappedStream',
  __objName: 'observable.flatMap(fn)',
  __plugResult: function(x){
    this.__plug(  this.__mapFn(x)  );
  },
  __onFirstIn: function(){
    this.__sourceStream.on(this.__plugResult, this);
    for (var i = 0; i < this.__plugged.length; i++) {
      this.__plugged[i].on(this._send, this);
    }
  },
  __onLastOut: function(){
    this.__sourceStream.off(this.__plugResult, this);
    for (var i = 0; i < this.__plugged.length; i++) {
      this.__plugged[i].off(this._send, this);
    }
  },
  __plug: function(stream){
    this.__plugged.push(stream);
    if (this.hasSubscribers()) {
      stream.on(this._send, this);
    }
    stream.onEnd(this.__unplug, this, stream);
  },
  __unplug: function(stream){
    if (!this.isEnded()) {
      stream.off(this._send, this);
      removeFromArray(this.__plugged, stream);
    }
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__sourceStream = null;
    this.__mapFn = null;
    this.__plugged = null;
  }

})

Observable.prototype.flatMap = function(fn) {
  return new Kefir.FlatMappedStream(this, fn);
};








// Merge

Kefir.MergedStream = function MergedStream(){
  Stream.call(this)
  this.__sources = firstArrOrToArr(arguments);
  for (var i = 0; i < this.__sources.length; i++) {
    this.__sources[i].onEnd(this.__unplug, this, this.__sources[i]);
  }
}

inherit(Kefir.MergedStream, Stream, {

  __ClassName: 'MergedStream',
  __objName: 'Kefir.merge(streams)',
  __onFirstIn: function(){
    for (var i = 0; i < this.__sources.length; i++) {
      this.__sources[i].onChanges(this._send, this);
    }
  },
  __onLastOut: function(){
    for (var i = 0; i < this.__sources.length; i++) {
      this.__sources[i].off(this._send, this);
    }
  },
  __unplug: function(stream){
    stream.off(this._send, this);
    removeFromArray(this.__sources, stream);
    if (this.__sources.length === 0) {
      this._send(Kefir.END);
    }
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__sources = null;
  }

});

Kefir.merge = function() {
  return new Kefir.MergedStream(firstArrOrToArr(arguments));
}

Stream.prototype.merge = function() {
  return Kefir.merge([this].concat(firstArrOrToArr(arguments)));
}









// Combine

Kefir.CombinedStream = function CombinedStream(sources, mapFn){
  Stream.call(this)

  this.__sources = sources;
  this.__cachedValues = new Array(sources.length);
  this.__hasCached = new Array(sources.length);
  this.__mapFn = mapFn;

  for (var i = 0; i < this.__sources.length; i++) {
    this.__sources[i].onEnd(this.__unplug, this, i);
  }

}

inherit(Kefir.CombinedStream, Stream, {

  __ClassName: 'CombinedStream',
  __objName: 'Kefir.combine(streams, fn)',
  __onFirstIn: function(){
    for (var i = 0; i < this.__sources.length; i++) {
      if (this.__sources[i]) {
        this.__sources[i].on(this.__receive, this, i);
      }
    }
  },
  __onLastOut: function(){
    for (var i = 0; i < this.__sources.length; i++) {
      if (this.__sources[i]) {
        this.__sources[i].off(this.__receive, this, i);
      }
    }
  },
  __unplug: function(i){
    this.__sources[i].off(this.__receive, this, i);
    this.__sources[i] = null
    if (isAllDead(this.__sources)) {
      this._send(Kefir.END);
    }
  },
  __receive: function(i, x) {
    this.__hasCached[i] = true;
    this.__cachedValues[i] = x;
    if (this.__allCached()) {
      if (isFn(this.__mapFn)) {
        this._send(this.__mapFn.apply(null, this.__cachedValues));
      } else {
        this._send(this.__cachedValues.slice(0));
      }
    }
  },
  __allCached: function(){
    for (var i = 0; i < this.__hasCached.length; i++) {
      if (!this.__hasCached[i]) {
        return false;
      }
    }
    return true;
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__sources = null;
    this.__cachedValues = null;
    this.__hasCached = null;
    this.__mapFn = null;
  }

});

Kefir.combine = function(sources, mapFn) {
  return new Kefir.CombinedStream(sources, mapFn);
}

Observable.prototype.combine = function(sources, mapFn) {
  return Kefir.combine([this].concat(sources), mapFn);
}

// FromPoll

var FromPollStream = Kefir.FromPollStream = function FromPollStream(interval, sourceFn){
  Stream.call(this);
  this.__interval = interval;
  this.__intervalId = null;
  var _this = this;
  this.__send = function(){  _this._send(sourceFn())  }
}

inherit(FromPollStream, Stream, {

  __ClassName: 'FromPollStream',
  __objName: 'Kefir.fromPoll(interval, fn)',
  __onFirstIn: function(){
    this.__intervalId = setInterval(this.__send, this.__interval);
  },
  __onLastOut: function(){
    if (this.__intervalId !== null){
      clearInterval(this.__intervalId);
      this.__intervalId = null;
    }
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__send = null;
  }

});

Kefir.fromPoll = function(interval, fn){
  return withName('Kefir.fromPoll(interval, fn)', new FromPollStream(interval, fn));
}



// Interval

Kefir.interval = function(interval, x){
  return withName('Kefir.interval(interval, x)', new FromPollStream(interval, function(){  return x }));
}



// Sequentially

Kefir.sequentially = function(interval, xs){
  xs = xs.slice(0);
  return withName('Kefir.sequentially(interval, xs)', new FromPollStream(interval, function(){
    if (xs.length === 0) {
      return END;
    }
    if (xs.length === 1){
      return Kefir.bunch(xs[0], END);
    }
    return xs.shift();
  }));
}



// Repeatedly

Kefir.repeatedly = function(interval, xs){
  var i = -1;
  return withName('Kefir.repeatedly(interval, xs)', new FromPollStream(interval, function(){
    return xs[++i % xs.length];
  }));
}

// TODO
//
// // more underscore-style maybe?
// observable.delay(delay)
// observable.throttle(delay)
// observable.debounce(delay)
// observable.debounceImmediate(delay)
//
// Kefir.later(delay, value)


  if (typeof define === 'function' && define.amd) {
    define([], function() {
      return Kefir;
    });
    global.Kefir = Kefir;
  } else if (typeof module === "object" && typeof exports === "object") {
    module.exports = Kefir;
    Kefir.Kefir = Kefir;
  } else {
    global.Kefir = Kefir;
  }

}(this));