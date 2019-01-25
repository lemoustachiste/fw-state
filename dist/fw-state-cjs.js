'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
/* global Reflect, Promise */













function __awaiter(thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

class Bus {
    constructor() {
        this.listeners = new Map();
    }
    subscribe(type, cb) {
        let listeners = this.listeners.get(type);
        if (listeners == null) {
            listeners = [];
            this.listeners.set(type, listeners);
        }
        listeners.push(cb);
        return {
            dispose: () => {
                let listeners = this.listeners.get(type);
                if (listeners == null)
                    return;
                const idx = listeners.indexOf(cb);
                if (idx > -1) {
                    listeners.splice(idx, 1);
                }
            },
        };
    }
    publish(message) {
        let listeners = this.listeners.get(message.constructor);
        if (listeners != null) {
            listeners.forEach(l => l(message));
        }
    }
}

const handlers = new Map();
function handle(fn, wrapper) {
    return function (target, method) {
        handlers.set(fn, handlers.get(fn) || []);
        handlers.set(fn, handlers.get(fn).concat([{ target, method, wrapper }]));
    };
}
const waitForGraph = new Map();
function waitFor(storeToWaitOn) {
    return function (waiter) {
        waitForGraph.set(waiter, storeToWaitOn);
    };
}
function groupByAsMap(things, on) {
    const map = new Map();
    things.forEach((thing) => {
        const result = on(thing);
        map.set(result, map.get(result) || []);
        map.set(result, map.get(result).concat([thing]));
    });
    return map;
}
let container = null;
function setupStores(getter, ...stores) {
    container = getter;
    stores.forEach(s => getter.get(s));
}
function dispatchOnStore(event, handlers, target, dispatchRuns) {
    return __awaiter(this, void 0, void 0, function* () {
        // if we have already run, GET OUTA HERE
        if (dispatchRuns.get(target.constructor))
            return;
        const wait = waitForGraph.get(target.constructor);
        if (wait && dispatchRuns.get(wait) == null) {
            yield performDispatch(event, wait, dispatchRuns);
        }
        const promises = [];
        // todo, cache these
        const instance = container.get(target.constructor);
        for (let hi = 0; hi < handlers.length; hi++) {
            let result;
            if (handlers[hi].wrapper) {
                const callHandler = () => {
                    return instance[handlers[hi].method].apply(instance, [event]);
                };
                const wrapperInstance = container.get(handlers[hi].wrapper);
                result = wrapperInstance.handle.apply(wrapperInstance, [callHandler, event]);
            }
            else {
                result = instance[handlers[hi].method].apply(instance, [event]);
            }
            if (result instanceof Promise) {
                promises.push(result);
            }
        }
        if (promises.length > 0) {
            yield Promise.all(promises);
        }
        dispatchRuns.set(target.constructor, true);
    });
}
function performDispatch(event, onlyTarget = null, dispatchRuns = new Map()) {
    return __awaiter(this, void 0, void 0, function* () {
        const eventHandlers = handlers.get(event.constructor);
        if (eventHandlers == null)
            return;
        let groupedHandlers = groupByAsMap(eventHandlers, eh => eh.target);
        if (onlyTarget) {
            if (groupedHandlers.get(onlyTarget)) {
                let onlyTargetGroup = groupedHandlers.get(onlyTarget);
                groupedHandlers = new Map();
                groupedHandlers.set(onlyTarget, onlyTargetGroup);
            }
            else {
                // welp, nothing to handle here.. move along
                return;
            }
        }
        for (let [target, handlers] of groupedHandlers) {
            yield dispatchOnStore(event, handlers, target, dispatchRuns);
        }
    });
}
function dispatch(event) {
    if (handlers.has(event.constructor)) {
        return performDispatch(event);
    }
}
class StoreStateChanged {
}
class Store {
    constructor() {
        this.stateSet = false;
        this.waiters = [];
        this.localBus = new Bus();
        this.state = this.defaultState();
    }
    setState(newStateFn) {
        const newState = newStateFn(this.state);
        Object.assign(this.state, newState);
        this.localBus.publish(new StoreStateChanged());
        if (!this.stateSet) {
            this.stateSet = true;
            this.waiters.forEach(w => w());
            this.waiters = [];
        }
    }
    // this will return a promise that waits for the
    // first time setState is called (so when something other than the defaultState
    // is called
    wait() {
        if (this.stateSet)
            return Promise.resolve();
        return new Promise((res) => {
            this.waiters.push(res);
        });
    }
    onStateChanged(cb) {
        return this.localBus.subscribe(StoreStateChanged, cb);
    }
}

exports.handle = handle;
exports.waitFor = waitFor;
exports.setupStores = setupStores;
exports.dispatch = dispatch;
exports.Store = Store;
