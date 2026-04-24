(function(UserAgentData) {
    ( () => {
        "use strict";
        let e, t, n, r, o, s, a, i;
        var l, c, d = {
            44361(e) {
                var t = Object.prototype.hasOwnProperty
                  , n = "~";
                function r() {}
                function o(e, t, n) {
                    this.fn = e,
                    this.context = t,
                    this.once = n || !1
                }
                function s(e, t, r, s, a) {
                    if ("function" != typeof r)
                        throw TypeError("The listener must be a function");
                    var i = new o(r,s || e,a)
                      , l = n ? n + t : t;
                    return e._events[l] ? e._events[l].fn ? e._events[l] = [e._events[l], i] : e._events[l].push(i) : (e._events[l] = i,
                    e._eventsCount++),
                    e
                }
                function a(e, t) {
                    0 == --e._eventsCount ? e._events = new r : delete e._events[t]
                }
                function i() {
                    this._events = new r,
                    this._eventsCount = 0
                }
                Object.create && (r.prototype = Object.create(null),
                new r().__proto__ || (n = !1)),
                i.prototype.eventNames = function() {
                    var e, r, o = [];
                    if (0 === this._eventsCount)
                        return o;
                    for (r in e = this._events)
                        t.call(e, r) && o.push(n ? r.slice(1) : r);
                    return Object.getOwnPropertySymbols ? o.concat(Object.getOwnPropertySymbols(e)) : o
                }
                ,
                i.prototype.listeners = function(e) {
                    var t = n ? n + e : e
                      , r = this._events[t];
                    if (!r)
                        return [];
                    if (r.fn)
                        return [r.fn];
                    for (var o = 0, s = r.length, a = Array(s); o < s; o++)
                        a[o] = r[o].fn;
                    return a
                }
                ,
                i.prototype.listenerCount = function(e) {
                    var t = n ? n + e : e
                      , r = this._events[t];
                    return r ? r.fn ? 1 : r.length : 0
                }
                ,
                i.prototype.emit = function(e, t, r, o, s, a) {
                    var i = n ? n + e : e;
                    if (!this._events[i])
                        return !1;
                    var l, c, d = this._events[i], u = arguments.length;
                    if (d.fn) {
                        switch (d.once && this.removeListener(e, d.fn, void 0, !0),
                        u) {
                        case 1:
                            return d.fn.call(d.context),
                            !0;
                        case 2:
                            return d.fn.call(d.context, t),
                            !0;
                        case 3:
                            return d.fn.call(d.context, t, r),
                            !0;
                        case 4:
                            return d.fn.call(d.context, t, r, o),
                            !0;
                        case 5:
                            return d.fn.call(d.context, t, r, o, s),
                            !0;
                        case 6:
                            return d.fn.call(d.context, t, r, o, s, a),
                            !0
                        }
                        for (c = 1,
                        l = Array(u - 1); c < u; c++)
                            l[c - 1] = arguments[c];
                        d.fn.apply(d.context, l)
                    } else {
                        var p, h = d.length;
                        for (c = 0; c < h; c++)
                            switch (d[c].once && this.removeListener(e, d[c].fn, void 0, !0),
                            u) {
                            case 1:
                                d[c].fn.call(d[c].context);
                                break;
                            case 2:
                                d[c].fn.call(d[c].context, t);
                                break;
                            case 3:
                                d[c].fn.call(d[c].context, t, r);
                                break;
                            case 4:
                                d[c].fn.call(d[c].context, t, r, o);
                                break;
                            default:
                                if (!l)
                                    for (p = 1,
                                    l = Array(u - 1); p < u; p++)
                                        l[p - 1] = arguments[p];
                                d[c].fn.apply(d[c].context, l)
                            }
                    }
                    return !0
                }
                ,
                i.prototype.on = function(e, t, n) {
                    return s(this, e, t, n, !1)
                }
                ,
                i.prototype.once = function(e, t, n) {
                    return s(this, e, t, n, !0)
                }
                ,
                i.prototype.removeListener = function(e, t, r, o) {
                    var s = n ? n + e : e;
                    if (!this._events[s])
                        return this;
                    if (!t)
                        return a(this, s),
                        this;
                    var i = this._events[s];
                    if (i.fn)
                        i.fn !== t || o && !i.once || r && i.context !== r || a(this, s);
                    else {
                        for (var l = 0, c = [], d = i.length; l < d; l++)
                            (i[l].fn !== t || o && !i[l].once || r && i[l].context !== r) && c.push(i[l]);
                        c.length ? this._events[s] = 1 === c.length ? c[0] : c : a(this, s)
                    }
                    return this
                }
                ,
                i.prototype.removeAllListeners = function(e) {
                    var t;
                    return e ? (t = n ? n + e : e,
                    this._events[t] && a(this, t)) : (this._events = new r,
                    this._eventsCount = 0),
                    this
                }
                ,
                i.prototype.off = i.prototype.removeListener,
                i.prototype.addListener = i.prototype.on,
                i.prefixed = n,
                i.EventEmitter = i,
                e.exports = i
            }
        }, u = {};
        function p(e) {
            var t = u[e];
            if (void 0 !== t)
                return t.exports;
            var n = u[e] = {
                exports: {}
            };
            return d[e](n, n.exports, p),
            n.exports
        }
        p.g = ( () => {
            if ("object" == typeof globalThis)
                return globalThis;
            try {
                return this || Function("return this")()
            } catch {
                if ("object" == typeof window)
                    return window
            }
        }
        )(),
        p.rv = () => "1.7.6",
        p.ruid = "bundler=rspack@1.7.6";
        let h = /YYYY|MM|DD|HH|mm|ss/g
          , g = {
            none: 0,
            trace: 10,
            debug: 100,
            info: 1e3,
            warn: 1e4,
            error: 1e5
        };
        class f {
            core;
            label;
            constructor(e, ...t) {
                this.core = e,
                this.label = t
            }
            log(e, t, ...n) {
                let r, o = function(...e) {
                    let t = {};
                    return e.forEach(e => {
                        e.forEach(e => {
                            Object.keys(e).forEach(n => {
                                t[n] = e[n]
                            }
                            )
                        }
                        )
                    }
                    ),
                    t
                }(this.label, n);
                g[e] >= g[this.core.level] && this.core.writer.write(e, t, o);
                try {
                    r = JSON.stringify(o)
                } catch (e) {
                    r = o,
                    console.error("Logger label JSON stringify error:", e)
                }
                if ("none" !== this.core.consoleLevel && g[e] >= g[this.core.consoleLevel]) {
                    "object" == typeof t && (t = JSON.stringify(t));
                    let n = `${function(e=new Date, t="YYYY-MM-DD HH:mm:ss") {
                        return t.replace(h, t => {
                            switch (t) {
                            case "YYYY":
                                return e.getFullYear().toString();
                            case "MM":
                                {
                                    let t = e.getMonth() + 1;
                                    return t < 10 ? "0" + t : t.toString()
                                }
                            case "DD":
                                {
                                    let t = e.getDate();
                                    return t < 10 ? "0" + t : t.toString()
                                }
                            case "HH":
                                {
                                    let t = e.getHours();
                                    return t < 10 ? "0" + t : t.toString()
                                }
                            case "mm":
                                {
                                    let t = e.getMinutes();
                                    return t < 10 ? "0" + t : t.toString()
                                }
                            case "ss":
                                {
                                    let t = e.getSeconds();
                                    return t < 10 ? "0" + t : t.toString()
                                }
                            }
                            return t
                        }
                        )
                    }(new Date, "YYYY-MM-DD HH:mm:ss")} [${e}] ${t}`;
                    switch (e) {
                    case "error":
                        console.error(n, r);
                        break;
                    case "warn":
                        console.warn(n, r);
                        break;
                    default:
                        console.info(n, r)
                    }
                }
            }
            with(...e) {
                return new f(this.core,...this.label,...e)
            }
            trace(e, ...t) {
                this.log("trace", e, ...t)
            }
            debug(e, ...t) {
                this.log("debug", e, ...t)
            }
            info(e, ...t) {
                this.log("info", e, ...t)
            }
            warn(e, ...t) {
                this.log("warn", e, ...t)
            }
            error(e, ...t) {
                this.log("error", e, ...t)
            }
            static E(e) {
                return "string" == typeof e ? {
                    error: e
                } : e instanceof Error ? (console.error(e),
                {
                    error: e.message
                }) : "object" == typeof e ? e : {}
            }
        }
        class m {
            static instance;
            static getInstance() {
                return m.instance
            }
            static logger(...e) {
                return m.getInstance().logger(...e)
            }
            writer;
            level = "info";
            consoleLevel = "warn";
            labels;
            constructor(e) {
                this.writer = e.writer,
                this.level = e.level || this.level,
                this.labels = e.labels || {},
                void 0 !== e.consoleLevel && (this.consoleLevel = e.consoleLevel),
                m.instance || (m.instance = this)
            }
            logger(...e) {
                return new f(this,this.labels,...e)
            }
        }
        class y {
            msgSender;
            action;
            constructor(e, t="logger") {
                this.msgSender = e,
                this.action = t
            }
            write(e, t, n) {
                this.msgSender.sendMessage({
                    action: this.action,
                    data: {
                        id: 0,
                        level: e,
                        message: t,
                        label: n,
                        createtime: Date.now()
                    }
                })
            }
        }
        let b = {
            randomUUID: "u" > typeof crypto && crypto.randomUUID && crypto.randomUUID.bind(crypto)
        }
          , M = new Uint8Array(16)
          , v = [];
        for (let e = 0; e < 256; ++e)
            v.push((e + 256).toString(16).slice(1));
        let w = "function" == typeof crypto.randomUUID ? crypto.randomUUID.bind(crypto) : function(t, n, r) {
            if (b.randomUUID && !n && !t)
                return b.randomUUID();
            let o = (t = t || {}).random ?? t.rng?.() ?? function() {
                if (!e) {
                    if ("u" < typeof crypto || !crypto.getRandomValues)
                        throw Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
                    e = crypto.getRandomValues.bind(crypto)
                }
                return e(M)
            }();
            if (o.length < 16)
                throw Error("Random bytes length must be >= 16");
            if (o[6] = 15 & o[6] | 64,
            o[8] = 63 & o[8] | 128,
            n) {
                if ((r = r || 0) < 0 || r + 16 > n.length)
                    throw RangeError(`UUID byte range ${r}:${r + 15} is out of buffer bounds`);
                for (let e = 0; e < 16; ++e)
                    n[r + e] = o[e];
                return n
            }
            return function(e, t=0) {
                return (v[e[t + 0]] + v[e[t + 1]] + v[e[t + 2]] + v[e[t + 3]] + "-" + v[e[t + 4]] + v[e[t + 5]] + "-" + v[e[t + 6]] + v[e[t + 7]] + "-" + v[e[t + 8]] + v[e[t + 9]] + "-" + v[e[t + 10]] + v[e[t + 11]] + v[e[t + 12]] + v[e[t + 13]] + v[e[t + 14]] + v[e[t + 15]]).toLowerCase()
            }(o)
        }
        ;
        var _ = p(44361);
        class E {
            messageId;
            EE;
            target;
            constructor(e, t, n) {
                this.messageId = e,
                this.EE = t,
                this.target = n,
                this.onDisconnect( () => {
                    this.EE.removeAllListeners("connectMessage:" + this.messageId),
                    this.EE.removeAllListeners("disconnect:" + this.messageId)
                }
                )
            }
            sendMessage(e) {
                let t = {
                    messageId: this.messageId,
                    type: "connectMessage",
                    data: e
                };
                this.target.postMessage(t)
            }
            onMessage(e) {
                this.EE.addListener(`connectMessage:${this.messageId}`, e)
            }
            disconnect() {
                let e = {
                    messageId: this.messageId,
                    type: "disconnect",
                    data: null
                };
                this.target.postMessage(e)
            }
            onDisconnect(e) {
                this.EE.addListener(`disconnect:${this.messageId}`, e)
            }
        }
        let I = {
            inboundFlag: ".ib",
            outboundFlag: ".ob",
            scriptLoadComplete: ".slc",
            envLoadComplete: ".elc",
            domEvent: ".dom"
        }
          , G = MouseEvent
          , C = CustomEvent
          , A = performance
          , R = A.dispatchEvent.bind(A)
          , x = A.addEventListener.bind(A)
          , T = A.removeEventListener.bind(A)
          , P = "function" == typeof cloneInto ? cloneInto : null
          , S = (e, t) => (P && t && (t = P(t, A)),
        R(new C(e,{
            detail: t,
            cancelable: !0
        })))
          , k = (e, t) => new G(e,t);
        class L {
            isReady = !1;
            resolve = null;
            promise = new Promise(e => {
                this.resolve = e
            }
            );
            onReady(e) {
                this.isReady ? e() : this.promise.then(e)
            }
            setReady() {
                this.resolve?.(),
                this.isReady = !0,
                this.resolve = null,
                this.promise = null
            }
        }
        let O = new Map;
        O.set = Map.prototype.set,
        O.get = Map.prototype.get,
        O.delete = Map.prototype.delete;
        let U = 0
          , j = Number.MAX_SAFE_INTEGER;
        class $ {
            send;
            constructor(e) {
                this.send = e
            }
            postMessage(e) {
                this.send.nativeSend(e)
            }
        }
        class D {
            isInbound;
            envTag;
            EE = new _;
            receiveFlag;
            sendFlag;
            relatedTarget = new Map;
            readyWrap = new L;
            constructor(e, t, n="") {
                this.isInbound = t,
                this.envTag = n;
                let r = `${e}${n}`;
                this.receiveFlag = `${r}${t ? I.inboundFlag : I.outboundFlag}${I.domEvent}`,
                this.sendFlag = `${r}${t ? I.outboundFlag : I.inboundFlag}${I.domEvent}`,
                x(this.receiveFlag, e => {
                    e instanceof G && 0 === e.movementX && e.cancelable ? (e.preventDefault(),
                    this.readyWrap.setReady()) : e instanceof G && e.movementX && e.relatedTarget ? (e.cancelable && e.preventDefault(),
                    O.set(e.movementX, e.relatedTarget)) : e instanceof C && this.messageHandle(e.detail, new $(this))
                }
                ),
                !1 === R(k(this.sendFlag, {
                    movementX: 0,
                    cancelable: !0
                })) && this.readyWrap.setReady()
            }
            messageHandle(e, t) {
                "sendMessage" === e.type ? this.EE.emit("message", e.data, n => {
                    if (!e.messageId)
                        return;
                    let r = {
                        messageId: e.messageId,
                        type: "respMessage",
                        data: n
                    };
                    t.postMessage(r)
                }
                ) : "respMessage" === e.type ? this.EE.emit(`response:${e.messageId}`, e) : "connect" === e.type ? this.EE.emit("connect", e.data, new E(e.messageId,this.EE,t)) : "disconnect" === e.type ? this.EE.emit(`disconnect:${e.messageId}`) : "connectMessage" === e.type && this.EE.emit(`connectMessage:${e.messageId}`, e.data)
            }
            onConnect(e) {
                this.EE.addListener("connect", e)
            }
            onMessage(e) {
                this.EE.addListener("message", e)
            }
            connect(e) {
                return new Promise(t => {
                    this.readyWrap.onReady( () => {
                        let n = {
                            messageId: w(),
                            type: "connect",
                            data: e
                        };
                        this.nativeSend(n),
                        t(new E(n.messageId,this.EE,new $(this)))
                    }
                    )
                }
                )
            }
            nativeSend(e) {
                if (!this.readyWrap.isReady)
                    throw Error("custom_event_message is not ready.");
                S(this.sendFlag, e)
            }
            sendMessage(e) {
                return new Promise(t => {
                    this.readyWrap.onReady( () => {
                        let n = w()
                          , r = `response:${n}`;
                        this.EE.addListener(r, e => {
                            this.EE.removeAllListeners(r),
                            t(e.data),
                            t = null
                        }
                        ),
                        this.nativeSend({
                            messageId: n,
                            type: "sendMessage",
                            data: e
                        })
                    }
                    )
                }
                )
            }
            syncSendMessage(e) {
                let t;
                if (!this.readyWrap.isReady)
                    throw Error("custom_event_message is not ready.");
                let n = w()
                  , r = `response:${n}`;
                if (this.EE.addListener(r, e => {
                    t = e.data
                }
                ),
                this.nativeSend({
                    messageId: n,
                    type: "sendMessage",
                    data: e
                }),
                this.EE.removeAllListeners(r),
                !t)
                    throw Error("syncSendMessage response failed.");
                return t
            }
            sendRelatedTarget(e) {
                if (!this.readyWrap.isReady)
                    throw Error("custom_event_message is not ready.");
                let t = U = U === j ? 1 : U + 1;
                return R(k(this.sendFlag, {
                    movementX: t,
                    relatedTarget: e
                })),
                t
            }
            getAndDelRelatedTarget(e) {
                let t = O.get(e);
                return O.delete(e),
                t
            }
        }
        class F {
            con;
            constructor(e) {
                this.con = e
            }
            sendMessage(e) {
                this.con.postMessage(e)
            }
            onMessage(e) {
                this.con.onMessage.addListener(e)
            }
            disconnect() {
                this.con.disconnect()
            }
            onDisconnect(e) {
                this.con.onDisconnect.addListener(e)
            }
            getPort() {
                return this.con
            }
        }
        class N {
            sender;
            mType;
            constructor(e) {
                this.sender = e,
                this.sender instanceof F ? this.mType = 3 : this.mType = 1
            }
            getType() {
                return this.mType
            }
            isType(e) {
                return (this.mType & e) === e
            }
            getSender() {
                return this.sender instanceof F ? this.sender.getPort().sender : void 0
            }
            getExtMessageSender() {
                if (!(this.sender instanceof F))
                    return {
                        windowId: -1,
                        tabId: -1,
                        frameId: void 0,
                        documentId: void 0
                    };
                {
                    let e = this.sender.getPort();
                    return {
                        windowId: e.sender?.tab?.windowId || -1,
                        tabId: e.sender?.tab?.id || -1,
                        frameId: e.sender?.frameId,
                        documentId: e.sender?.documentId
                    }
                }
            }
            getConnect() {
                return this.sender
            }
        }
        class V {
            sender;
            mType;
            constructor(e) {
                this.sender = e,
                this.mType = 4
            }
            getType() {
                return this.mType
            }
            isType(e) {
                return (this.mType & e) === e
            }
            getSender() {
                return this.sender
            }
            getExtMessageSender() {
                let e = this.sender;
                return {
                    windowId: e.tab?.windowId || -1,
                    tabId: e.tab?.id || -1,
                    frameId: e.frameId,
                    documentId: e.documentId
                }
            }
            getConnect() {}
        }
        let B = e => {
            if (!e)
                return `${e}`;
            if ("string" == typeof e?.message)
                return e.message;
            if ("object" == typeof e)
                try {
                    return JSON.stringify(e)
                } catch {}
            return e.toString()
        }
        ;
        class H {
            enableConnect;
            apiFunctionMap = new Map;
            logger = m.getInstance().logger({
                service: "messageServer"
            });
            constructor(e, t, n=!0) {
                this.enableConnect = n;
                let r = Array.isArray(t) ? t : [t];
                this.enableConnect && r.forEach(t => {
                    t.onConnect( (t, n) => {
                        if ("string" == typeof t.action)
                            return this.logger.trace("server onConnect", {
                                msg: t
                            }),
                            !!t.action?.startsWith(e) && this.connectHandle(t.action.slice(e.length + 1), t.data, n)
                    }
                    )
                }
                ),
                r.forEach(t => (t.onMessage( (t, n, r) => {
                    if ("string" == typeof t.action && (this.logger.trace("server onMessage", {
                        msg: t
                    }),
                    t.action?.startsWith(e)))
                        return this.messageHandle(t.action.slice(e.length + 1), t.data, n, r)
                }
                ),
                !1))
            }
            group(e, t) {
                return new Y(this,e,t)
            }
            on(e, t) {
                this.apiFunctionMap.set(e, t)
            }
            connectHandle(e, t, n) {
                let r = this.apiFunctionMap.get(e);
                if (r) {
                    let e = r(t, new N(n));
                    return e && (e instanceof Promise ? e.then(e => {
                        e && n.sendMessage({
                            code: 0,
                            data: e
                        })
                    }
                    ).catch(e => {
                        n.sendMessage({
                            code: -1,
                            message: B(e)
                        }),
                        this.logger.error("connectHandle error", f.E(e))
                    }
                    ) : n.sendMessage({
                        code: 0,
                        data: e
                    })),
                    !0
                }
            }
            messageHandle(e, t, n, r) {
                let o = this.apiFunctionMap.get(e);
                if (o)
                    try {
                        let e = o(t, new V(r));
                        if (e instanceof Promise)
                            return e.then(e => {
                                try {
                                    n({
                                        code: 0,
                                        data: e
                                    })
                                } catch (e) {
                                    this.logger.error("sendResponse error", f.E(e))
                                }
                            }
                            ).catch(e => {
                                n({
                                    code: -1,
                                    message: B(e)
                                }),
                                this.logger.error("messageHandle error", f.E(e))
                            }
                            ),
                            !0;
                        n({
                            code: 0,
                            data: e
                        })
                    } catch (e) {
                        n({
                            code: -1,
                            message: B(e)
                        }),
                        this.logger.error("messageHandle error", f.E(e))
                    }
                else
                    n({
                        code: -1,
                        message: "no such api " + e
                    }),
                    this.logger.error("no such api", {
                        action: e
                    })
            }
        }
        class Y {
            server;
            name;
            middlewares = [];
            constructor(e, t, n) {
                this.server = e,
                this.name = t,
                !t.endsWith("/") && t.length > 0 && (this.name += "/"),
                n && this.middlewares.push(n)
            }
            group(e, t) {
                let n = new Y(this.server,`${this.name}${e}`,t);
                return n.middlewares = [...this.middlewares, ...n.middlewares],
                n
            }
            use(e) {
                let t = new Y(this.server,`${this.name}`,e);
                return t.middlewares = [...this.middlewares, ...t.middlewares],
                t
            }
            on(e, t) {
                let n = `${this.name}${e}`;
                0 === this.middlewares.length ? this.server.on(n, t) : this.server.on(n, async (e, n) => {
                    let r = 0
                      , o = async () => {
                        if (!(r < this.middlewares.length))
                            return await t(e, n);
                        {
                            let t = this.middlewares[r++];
                            return await t(e, n, o)
                        }
                    }
                    ;
                    return await o()
                }
                )
            }
        }
        function W(e, t) {
            return Math.floor(Math.random() * (t - e + 1)) + e
        }
        function q(e) {
            let t = e.metadata?.storagename;
            return t ? t[0] : e.uuid
        }
        let K = new Map;
        function X(e, t, n, r) {
            let o = K.get(e);
            o || K.set(e, o = []),
            o.push({
                fnKey: t,
                api: n,
                param: r
            })
        }
        let J = {};
        class z {
            static protected(e) {
                return (t, n) => {
                    J[n] = e
                }
            }
            static API(e={}) {
                return (t, n, r) => {
                    let {follow: o} = e
                      , {alias: s} = e;
                    o || (o = n),
                    X(o, n, r.value, e),
                    s && X(s, s, r.value, e)
                }
            }
        }
        let Q = e => {
            let t = document;
            if (t.body) {
                try {
                    e()
                } catch {}
                return
            }
            let n = function() {
                (this.body || document !== this) && null !== n && (this.removeEventListener("load", n, !1),
                this.removeEventListener("DOMNodeInserted", n, !1),
                this.removeEventListener("DOMContentLoaded", n, !1),
                n = null,
                Q(e))
            };
            t.addEventListener("load", n, !1),
            t.addEventListener("DOMNodeInserted", n, !1),
            t.addEventListener("DOMContentLoaded", n, !1),
            t = null
        }
        ;
        class Z {
            counterId = 0;
            listeners = new Map;
            add(e, t) {
                let n = ++this.counterId
                  , r = this.listeners.get(e);
                return r || this.listeners.set(e, r = new Map),
                r.set(n, t),
                n
            }
            execute(e, ...t) {
                let n = this.listeners.get(e);
                if (n)
                    for (let r of n.values())
                        r?.(e, ...t)
            }
            remove(e) {
                let t = +e || 0;
                if (t > 0) {
                    for (let[e,n] of this.listeners)
                        if (n.delete(t))
                            return 0 === n.size && this.listeners.delete(e),
                            !0
                }
                return !1
            }
            clear() {
                for (let[e,t] of this.listeners)
                    t.clear();
                this.listeners.clear()
            }
        }
        function ee(e, t, n, r) {
            var o, s = arguments.length, a = s < 3 ? t : null === r ? r = Object.getOwnPropertyDescriptor(t, n) : r;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate)
                a = Reflect.decorate(e, t, n, r);
            else
                for (var i = e.length - 1; i >= 0; i--)
                    (o = e[i]) && (a = (s < 3 ? o(a) : s > 3 ? o(t, n, a) : o(t, n)) || a);
            return s > 3 && a && Object.defineProperty(t, n, a),
            a
        }
        let et = {
            structuredClone: "function" == typeof structuredClone ? structuredClone : () => {
                throw "unsupportedAPI"
            }
            ,
            jsonStringify: JSON.stringify.bind(JSON),
            jsonParse: JSON.parse.bind(JSON),
            createElement: Document.prototype.createElement,
            ownFragment: new DocumentFragment,
            objectCreate: Object.create.bind(Object),
            objectGetOwnPropertyDescriptors: Object.getOwnPropertyDescriptors.bind(Object)
        }
          , en = e => {
            if ("object" != typeof e)
                return e;
            try {
                return et.structuredClone(e)
            } catch {}
            try {
                return et.jsonParse(et.jsonStringify(e))
            } catch {}
            console.error("customClone failed")
        }
        ;
        async function er(e, t, n) {
            let r = await e.sendMessage({
                action: t,
                data: n
            })
              , o = m.getInstance().logger().with({
                action: t,
                data: n,
                response: r
            });
            if (o.trace("sendMessage"),
            r?.code)
                throw console.error(r),
                r.message;
            try {
                return r.data
            } catch (e) {
                o.trace("Invalid response data", f.E(e));
                return
            }
        }
        let eo = [1]
          , es = [2]
          , ea = e => {
            switch (e[0]) {
            case 1:
                return;
            case 2:
                return null;
            default:
                return e[1]
            }
        }
          , ei = e => {
            switch (e) {
            case void 0:
                return eo;
            case null:
                return es;
            default:
                return [0, e]
            }
        }
        ;
        function el(e) {
            if ("function" == typeof Uint8Array.fromBase64)
                return Uint8Array.fromBase64(e);
            {
                if ("u" > typeof Buffer && "function" == typeof Buffer.from)
                    return Uint8Array.from(Buffer.from(e, "base64"));
                let t = atob(e)
                  , n = new Uint8Array(new ArrayBuffer(t.length));
                for (let e = 0, r = t.length; e < r; e++)
                    n[e] = t.charCodeAt(e);
                return n
            }
        }
        function ec(e) {
            if ("function" == typeof e.toBase64)
                return e.toBase64();
            {
                if ("u" > typeof Buffer && "function" == typeof Buffer.from)
                    return Buffer.from(e).toString("base64");
                let t = ""
                  , n = 0;
                for (; e.length - n > 65535; )
                    t += String.fromCharCode(...e.slice(n, n + 65535)),
                    n += 65535;
                return btoa(t += String.fromCharCode(...n ? e.slice(n) : e))
            }
        }
        function ed(e) {
            let t = e.length;
            if (0 === t)
                return new Uint8Array(0);
            if (1 === t)
                return new Uint8Array(e[0]);
            let n = 0;
            for (let r = 0; r < t; r++)
                n += e[r].byteLength;
            let r = new Uint8Array(n)
              , o = 0;
            for (let n = 0; n < t; n++) {
                let t = e[n];
                r.set(t, o),
                o += t.byteLength
            }
            return r
        }
        let eu = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array]
          , ep = eu.map(e => e.name)
          , eh = "function" == typeof URL.createObjectURL ? e => URL.createObjectURL(e) : async () => {
            throw "Invalid Call of innerToBlobUrl"
        }
          , eg = async e => {
            if (e?.then && (e = await e),
            e instanceof Document)
                throw Error("GM xhr data does not support Document");
            let t = {
                type: void 0 === e ? "undefined" : null === e ? "null" : "undefined",
                m: null
            };
            if (e instanceof ReadableStream && (e = await new Response(e).blob()),
            e instanceof DataView)
                t = {
                    type: "DataView",
                    m: ec(new Uint8Array(e.buffer,e.byteOffset,e.byteLength))
                };
            else if (e instanceof URLSearchParams)
                t = {
                    type: "URLSearchParams",
                    m: `${e}`
                };
            else if (e instanceof FormData)
                t = {
                    type: "FormData",
                    m: await Promise.all([...e.entries()].map( ([e,t]) => t instanceof File ? Promise.resolve(eh(t)).then(n => ({
                        key: e,
                        type: "file",
                        val: n,
                        mimeType: t.type,
                        filename: t.name,
                        lastModified: t.lastModified
                    })) : {
                        key: e,
                        type: "text",
                        val: t
                    }))
                };
            else if (ArrayBuffer.isView(e))
                if (e instanceof Uint8Array)
                    t = {
                        type: "Uint8Array",
                        m: ec(e)
                    };
                else {
                    let n = eu.findIndex(t => e instanceof t);
                    if (n >= 0) {
                        let r = e.buffer;
                        t = {
                            type: ep[n],
                            m: ec(new Uint8Array(r))
                        }
                    } else
                        throw Error("Unsupported ArrayBuffer View")
                }
            else if (e instanceof Blob)
                t = e instanceof File ? {
                    type: "File",
                    m: [await eh(e), e?.name, e?.lastModified]
                } : {
                    type: "Blob",
                    m: [await eh(e)]
                };
            else if (e instanceof ArrayBuffer)
                t = {
                    type: "ArrayBuffer",
                    m: ec(new Uint8Array(e))
                };
            else if (e && "object" == typeof e) {
                let n;
                try {
                    n = JSON.stringify(e)
                } catch {
                    n = Array.isArray(e) ? "[]" : "{}"
                }
                t = {
                    type: "object",
                    m: n
                }
            } else
                null != e && (t = {
                    type: typeof e,
                    m: e
                });
            return t
        }
          , ef = {}
          , em = async e => {
            let t;
            for (; t = e.head; ) {
                let {task: n, resolve: r, reject: o} = t;
                t.task = t.resolve = t.reject = null;
                try {
                    let e = await n();
                    r(e)
                } catch (e) {
                    o(e)
                }
                e.head = t.next,
                t.next = null
            }
            e.tail = null
        }
          , ey = {
            NONE: 0,
            READABLE_STREAM: 1,
            UINT8_ARRAY_BUFFER: 2,
            STRING: 3
        }
          , eb = {
            UNSENT: 0,
            OPENED: 1,
            HEADERS_RECEIVED: 2,
            LOADING: 3,
            DONE: 4
        }
          , eM = (e, t) => "function" == typeof URL.createObjectURL ? URL.createObjectURL(t) : e.sendMessage("CAT_createBlobUrl", [t])
          , ev = async e => {
            let t = "";
            if ("string" == typeof e)
                t = e;
            else if (e instanceof URL)
                t = e.href;
            else
                e instanceof Blob && (t = await new Promise( (t, n) => {
                    let r = new FileReader;
                    r.onloadend = function() {
                        t(this.result)
                    }
                    ,
                    r.onerror = n,
                    r.onabort = n,
                    r.readAsDataURL(e)
                }
                ));
            return t
        }
          , ew = async (e, t, n) => {
            let r = await e.sendMessage("CAT_fetchDocument", [t, n]);
            return e.message.getAndDelRelatedTarget(r)
        }
          , e_ = new Set(["application/xhtml+xml", "application/xml", "image/svg+xml", "text/html", "text/xml"])
          , eE = new WeakMap
          , eI = {
            response: {
                get() {
                    let e = eE.get(this);
                    return e?.getResponse()
                },
                enumerable: !1,
                configurable: !1
            },
            responseXML: {
                get() {
                    let e = eE.get(this);
                    return e?.getResponseXML()
                },
                enumerable: !1,
                configurable: !1
            },
            responseText: {
                get() {
                    let e = eE.get(this);
                    return e?.getResponseText()
                },
                enumerable: !1,
                configurable: !1
            }
        };
        function eG(e, t, n, r=!1) {
            let o, s, a, i = !1;
            if (e.isInvalidContext())
                return {
                    retPromise: n ? Promise.reject("GM_xmlhttpRequest: Invalid Context") : null,
                    abort: () => {}
                };
            let l = n ? new Promise( (e, t) => {
                o = e,
                s = t
            }
            ) : null
              , c = "object" == typeof t.url ? ev(t.url) : t.url
              , d = eg(t.data)
              , u = t.headers;
            if (u)
                for (let e of Object.keys(u))
                    "cookie" === e.toLowerCase() && (t.cookie = u[e],
                    delete u[e]);
            let p = t.context;
            t.method && (t.method = `${t.method}`.toUpperCase());
            let h = {
                method: t.method,
                timeout: t.timeout,
                url: "",
                headers: t.headers,
                cookie: t.cookie,
                responseType: t.responseType,
                overrideMimeType: t.overrideMimeType,
                anonymous: t.anonymous,
                user: t.user,
                password: t.password,
                redirect: t.redirect,
                fetch: t.fetch
            };
            h.headers || (h.headers = {}),
            t.nocache && (h.headers["Cache-Control"] = "no-cache");
            let g = t.responseType?.toLocaleLowerCase() || ""
              , f = null;
            return (async () => {
                let n, l, u, [y,b] = await Promise.all([c, d]), M = new URL(y,window.location.href);
                h.url = M.href,
                h.data = b;
                let v = "stream" === g;
                if (v)
                    n = new ReadableStream({
                        start(e) {
                            l = e
                        }
                    });
                else
                    switch (g) {
                    case "arraybuffer":
                    case "blob":
                        h.responseType = "arraybuffer";
                        break;
                    default:
                        h.responseType = "text"
                    }
                if (r) {
                    let t = "POST" === h.method ? "POST" : "GET"
                      , n = {
                        ...h,
                        method: t,
                        downloadMode: "native",
                        name: ""
                    };
                    u = e.connect("GM_download", [n])
                } else
                    u = e.connect("GM_xmlhttpRequest", [h]);
                h = null,
                a = await u;
                let w = []
                  , _ = []
                  , E = null
                  , I = null
                  , G = !0
                  , C = `${Date.now()}:${Math.random()}`
                  , A = ""
                  , R = !1
                  , x = null
                  , T = null
                  , P = ""
                  , S = null
                  , k = ey.NONE;
                n && (R = !0,
                T = n,
                P = void 0,
                S = void 0,
                n = void 0);
                let L = () => {
                    U = null,
                    j = null,
                    f = null,
                    L = null,
                    a = null
                }
                  , O = () => {
                    i || v || (T = !1,
                    P = !1,
                    S = !1,
                    I = null,
                    E = null)
                }
                  , U = e => {
                    let t;
                    (4 === e.readyState || i) && "progress" !== e.eventType && (R = !0);
                    let n = null;
                    ("string" == typeof e.error && (0 === e.status || e.status >= 300 || e.status < 200) && !e.statusText && G || "aborted" === e.error) && (n = {
                        error: e.error,
                        readyState: e.readyState,
                        response: null,
                        responseHeaders: e.responseHeaders,
                        responseText: "",
                        status: e.status,
                        statusText: ""
                    });
                    let r = {
                        DONE: eb.DONE,
                        HEADERS_RECEIVED: eb.HEADERS_RECEIVED,
                        LOADING: eb.LOADING,
                        OPENED: eb.OPENED,
                        UNSENT: eb.UNSENT,
                        RESPONSE_TYPE_TEXT: "text",
                        RESPONSE_TYPE_ARRAYBUFFER: "arraybuffer",
                        RESPONSE_TYPE_BLOB: "blob",
                        RESPONSE_TYPE_DOCUMENT: "document",
                        RESPONSE_TYPE_JSON: "json",
                        RESPONSE_TYPE_STREAM: "stream",
                        toString: () => "[object Object]"
                    }
                      , o = !1;
                    if (n)
                        t = {
                            ...r,
                            ...n
                        };
                    else {
                        let n = {
                            ...r,
                            finalUrl: e.finalUrl,
                            readyState: e.readyState,
                            status: e.status,
                            statusText: e.statusText,
                            responseHeaders: e.responseHeaders,
                            responseType: g
                        };
                        R && (o = !0),
                        t = n,
                        e.error && (t.error = e.error)
                    }
                    return void 0 !== p && (t.context = p),
                    ( (e, t, n) => {
                        let r = {
                            ...et.objectGetOwnPropertyDescriptors(e)
                        };
                        if (!t)
                            return et.objectCreate(null, r);
                        r = {
                            ...r,
                            ...eI
                        };
                        let o = et.objectCreate(null, r)
                          , s = {
                            getResponse() {
                                if (!1 === T) {
                                    switch (g) {
                                    case "json":
                                        {
                                            let e, t = this.getResponseText();
                                            if (t)
                                                try {
                                                    e = et.jsonParse(t)
                                                } catch {}
                                            T = e;
                                            break
                                        }
                                    case "document":
                                        T = this.getResponseXML();
                                        break;
                                    case "arraybuffer":
                                        T = (E ||= ed(_)).buffer;
                                        break;
                                    case "blob":
                                        T = new Blob([E ||= ed(_)],{
                                            type: n || "application/octet-stream"
                                        });
                                        break;
                                    default:
                                        T = `${this.getResponseText()}`
                                    }
                                    i && (w.length = 0,
                                    _.length = 0)
                                }
                                return "json" === g && null === T && (T = void 0),
                                T
                            },
                            getResponseXML() {
                                if (!1 === S) {
                                    let e, t, r = this.getResponseText(), o = ((t = (e = n).indexOf(";")) > 0 && (e = e.substring(0, t)),
                                    e = e.trim().toLowerCase()), s = e_.has(o) ? o : "text/xml";
                                    if (void 0 !== r)
                                        try {
                                            S = new DOMParser().parseFromString(r, s)
                                        } catch (e) {
                                            S = null,
                                            console.error(e)
                                        }
                                    else
                                        S = void 0
                                }
                                return S
                            },
                            getResponseText() {
                                if (!1 === P) {
                                    if (k === ey.UINT8_ARRAY_BUFFER) {
                                        let e = (E ||= ed(_)).buffer;
                                        P = new TextDecoder("utf-8").decode(e)
                                    } else
                                        null === I && (I = `${w.join("")}`),
                                        P = I;
                                    i && (w.length = 0,
                                    _.length = 0)
                                }
                                return P
                            }
                        };
                        return eE.set(o, s),
                        o
                    }
                    )(t, o, e.contentType)
                }
                ;
                f = e => {
                    i || (x = "AbortError",
                    t.onabort?.(U?.(e) ?? {}),
                    i = !0,
                    L?.()),
                    f = null
                }
                ;
                let j = e => {
                    let n;
                    n = async () => {
                        let n = e.data;
                        if (-1 === e.code) {
                            m.logger().error("GM_xmlhttpRequest error", {
                                code: e.code,
                                message: e.message
                            }),
                            t.onerror?.({
                                readyState: eb.DONE,
                                error: e.message || "unknown"
                            });
                            return
                        }
                        switch (e.action) {
                        case "reset_chunk_arraybuffer":
                        case "reset_chunk_blob":
                        case "reset_chunk_buffer":
                            if (i || v) {
                                console.error("Invalid call of reset_chunk [buf]");
                                break
                            }
                            _.length = 0,
                            G = !0,
                            O();
                            break;
                        case "reset_chunk_document":
                        case "reset_chunk_json":
                        case "reset_chunk_text":
                            if (i || v) {
                                console.error("Invalid call of reset_chunk [str]");
                                break
                            }
                            w.length = 0,
                            G = !0,
                            O();
                            break;
                        case "append_chunk_stream":
                            {
                                let t = e.data.chunk
                                  , n = el(t);
                                _.push(n),
                                G = !1,
                                l?.enqueue(el(t)),
                                k = ey.READABLE_STREAM;
                                break
                            }
                        case "append_chunk_arraybuffer":
                        case "append_chunk_blob":
                        case "append_chunk_buffer":
                            {
                                if (i || v) {
                                    console.error("Invalid call of append_chunk [buf]");
                                    break
                                }
                                let t = el(e.data.chunk);
                                _.push(t),
                                G = !1,
                                k = ey.UINT8_ARRAY_BUFFER,
                                O();
                                break
                            }
                        case "append_chunk_document":
                        case "append_chunk_json":
                        case "append_chunk_text":
                            {
                                if (i || v) {
                                    console.error("Invalid call of append_chunk [str]");
                                    break
                                }
                                let t = e.data.chunk;
                                w.push(t),
                                G = !1,
                                k = ey.STRING,
                                O();
                                break
                            }
                        case "onload":
                            t.onload?.(U?.(n) ?? {});
                            break;
                        case "onloadend":
                            {
                                i = !0,
                                P = !1,
                                E = null,
                                I = null;
                                let e = U?.(n) ?? {};
                                t.onloadend?.(e),
                                null === x ? o?.(e) : s?.(x),
                                L?.();
                                break
                            }
                        case "onloadstart":
                            t.onloadstart?.(U?.(n) ?? {});
                            break;
                        case "onprogress":
                            if (t.onprogress) {
                                let e = {
                                    ...U?.(n) ?? {},
                                    lengthComputable: n.lengthComputable,
                                    loaded: n.loaded,
                                    total: n.total,
                                    done: n.loaded,
                                    totalSize: n.total
                                };
                                t.onprogress?.(e)
                            }
                            break;
                        case "onreadystatechange":
                            {
                                let e = `${n.readyState}:${n.status}`;
                                if (e === A)
                                    return;
                                A = e,
                                v && n.readyState === eb.DONE && (l = void 0),
                                t.onreadystatechange?.(U?.(n) ?? {});
                                break
                            }
                        case "ontimeout":
                            i || (x = "TimeoutError",
                            t.ontimeout?.(U?.(n) ?? {}),
                            i = !0,
                            L?.());
                            break;
                        case "onerror":
                            i || (n.error ||= "Unknown Error",
                            x = n.error,
                            t.onerror?.(U?.(n) ?? {}),
                            i = !0,
                            L?.());
                            break;
                        case "onabort":
                            f?.(n);
                            break;
                        default:
                            m.logger().warn("GM_xmlhttpRequest resp is error", {
                                data: e
                            })
                        }
                    }
                    ,
                    new Promise( (e, t) => {
                        let r = ef[C] || (ef[C] = {
                            head: null,
                            tail: null
                        })
                          , o = {
                            task: n,
                            resolve: e,
                            reject: t,
                            next: null
                        };
                        r.tail ? (r.tail.next = o,
                        r.tail = o) : (r.head = o,
                        r.tail = o,
                        em(r))
                    }
                    )
                }
                ;
                a?.onMessage(e => j?.(e))
            }
            )(),
            {
                retPromise: l,
                abort: () => {
                    a && (a.disconnect(),
                    a = null),
                    f && t.onabort && !i && (f?.({
                        error: "aborted",
                        responseHeaders: "",
                        readyState: 0,
                        status: 0,
                        statusText: ""
                    }),
                    i = !0)
                }
            }
        }
        let eC = {
            inject: "it",
            content: "ct"
        }
          , eA = {}
          , eR = 0
          , ex = `${W(8e11, 2e12).toString(36)}`
          , eT = new Map;
        class eP {
            runFlag;
            prefix;
            message;
            contentMsg;
            scriptRes;
            valueChangeListener;
            EE;
            context;
            grantSet;
            eventId;
            loadScriptResolve;
            loadScriptPromise;
            constructor(e=null, t=null) {
                if (t !== eA)
                    throw TypeError("Illegal invocation");
                Object.assign(this, e)
            }
            static createGMBase(e) {
                return new eP(e,eA)
            }
            isInvalidContext;
            setInvalidContext;
            async sendMessage(e, t) {
                let n;
                if (this.message && this.scriptRes) {
                    this.loadScriptPromise && await this.loadScriptPromise;
                    try {
                        n = await er(this.message, `${this.prefix}/runtime/gmApi`, {
                            uuid: this.scriptRes.uuid,
                            api: e,
                            params: t,
                            runFlag: this.runFlag
                        })
                    } catch (e) {
                        if (`${e?.message || e}`.includes("Extension context invalidated."))
                            this.setInvalidContext(),
                            console.error(e);
                        else
                            throw e
                    }
                    return n
                }
            }
            connect(e, t) {
                var n, r, o;
                return this.message && this.scriptRes ? (n = this.message,
                r = `${this.prefix}/runtime/gmApi`,
                o = {
                    uuid: this.scriptRes.uuid,
                    api: e,
                    params: t,
                    runFlag: this.runFlag
                },
                n.connect({
                    action: r,
                    data: o
                })) : new Promise( () => {}
                )
            }
            valueUpdate(e) {
                if (!this.scriptRes || !this.valueChangeListener)
                    return;
                let t = this.scriptRes
                  , {id: n, uuid: r, entries: o, storageName: s, sender: a, valueUpdated: i} = e;
                if (r === t.uuid || s === q(t)) {
                    let e = t.value
                      , r = a.runFlag !== this.runFlag;
                    if (!r && n) {
                        let e = eT.get(n);
                        e && (eT.delete(n),
                        e())
                    }
                    if (i)
                        for (let[t,n,s] of o) {
                            let o = ea(n)
                              , i = ea(s);
                            void 0 === o ? void 0 !== e[t] && delete e[t] : e[t] = o,
                            this.valueChangeListener.execute(t, i, o, r, a.tabId)
                        }
                }
            }
            emitEvent(e, t, n) {
                this.EE && this.EE.emit(`${e}:${t}`, n)
            }
        }
        ee([z.protected()], eP.prototype, "runFlag", void 0),
        ee([z.protected()], eP.prototype, "prefix", void 0),
        ee([z.protected()], eP.prototype, "message", void 0),
        ee([z.protected()], eP.prototype, "contentMsg", void 0),
        ee([z.protected()], eP.prototype, "scriptRes", void 0),
        ee([z.protected()], eP.prototype, "valueChangeListener", void 0),
        ee([z.protected()], eP.prototype, "EE", void 0),
        ee([z.protected()], eP.prototype, "context", void 0),
        ee([z.protected()], eP.prototype, "grantSet", void 0),
        ee([z.protected()], eP.prototype, "eventId", void 0),
        ee([z.protected()], eP.prototype, "loadScriptResolve", void 0),
        ee([z.protected()], eP.prototype, "loadScriptPromise", void 0),
        ee([z.protected()], eP, "createGMBase", null),
        ee([z.protected()], eP.prototype, "isInvalidContext", void 0),
        ee([z.protected()], eP.prototype, "setInvalidContext", void 0),
        ee([z.protected()], eP.prototype, "sendMessage", null),
        ee([z.protected()], eP.prototype, "connect", null),
        ee([z.protected()], eP.prototype, "valueUpdate", null),
        ee([z.protected()], eP.prototype, "emitEvent", null);
        class eS extends eP {
            prefix;
            message;
            contentMsg;
            scriptRes;
            notificationTagMap;
            constructor(e, t, n, r) {
                let o = new Z
                  , s = new _
                  , a = !1;
                super({
                    prefix: e,
                    message: t,
                    scriptRes: r,
                    valueChangeListener: o,
                    EE: s,
                    notificationTagMap: new Map,
                    eventId: 0,
                    setInvalidContext() {
                        a || (a = !0,
                        this.valueChangeListener.clear(),
                        this.EE.removeAllListeners(),
                        this.message = null,
                        this.scriptRes = null,
                        this.valueChangeListener = null,
                        this.EE = null)
                    },
                    isInvalidContext: () => a
                }, eA),
                this.prefix = e,
                this.message = t,
                this.contentMsg = n,
                this.scriptRes = r
            }
            static _GM_getValue(e, t, n) {
                if (!e.scriptRes)
                    return;
                let r = e.scriptRes.value[t];
                return void 0 !== r ? r && "object" == typeof r ? en(r) : r : n
            }
            GM_getValue(e, t) {
                return eL(this, e, t)
            }
            "GM.getValue"(e, t) {
                return new Promise(n => {
                    n(eL(this, e, t))
                }
                )
            }
            static _GM_setValue(e, t, n, r) {
                if (!e.scriptRes)
                    return;
                eR > 1e8 && (eR = 0,
                ex = `${W(8e11, 2e12).toString(36)}`);
                let o = `${ex}::${++eR}`;
                return t && eT.set(o, t),
                void 0 === r ? (delete e.scriptRes.value[n],
                e.sendMessage("GM_setValue", [o, n])) : (r && "object" == typeof r && (r = en(r)),
                e.scriptRes.value[n] = r,
                void 0 === r ? e.sendMessage("GM_setValue", [o, n]) : e.sendMessage("GM_setValue", [o, n, r])),
                o
            }
            static _GM_setValues(e, t, n) {
                if (!e.scriptRes)
                    return;
                eR > 1e8 && (eR = 0,
                ex = `${W(8e11, 2e12).toString(36)}`);
                let r = `${ex}::${++eR}`;
                t && eT.set(r, t);
                let o = e.scriptRes.value
                  , s = [];
                for (let[e,t] of Object.entries(n)) {
                    let n = t;
                    void 0 === n ? o[e] && delete o[e] : (n && "object" == typeof n && (n = en(n)),
                    o[e] = n),
                    s.push([e, ei(n)])
                }
                return e.sendMessage("GM_setValues", [r, s]),
                r
            }
            GM_setValue(e, t) {
                eU(this, null, e, t)
            }
            "GM.setValue"(e, t) {
                return new Promise(n => {
                    eU(this, n, e, t)
                }
                )
            }
            GM_deleteValue(e) {
                eU(this, null, e, void 0)
            }
            "GM.deleteValue"(e) {
                return new Promise(t => {
                    eU(this, t, e, void 0)
                }
                )
            }
            GM_listValues() {
                return this.scriptRes ? Object.keys(this.scriptRes.value) : []
            }
            "GM.listValues"() {
                return new Promise(e => {
                    if (!this.scriptRes)
                        return e([]);
                    e(Object.keys(this.scriptRes.value))
                }
                )
            }
            GM_setValues(e) {
                if (!e || "object" != typeof e)
                    throw Error("GM_setValues: values must be an object");
                ej(this, null, e)
            }
            GM_getValues(e) {
                if (!this.scriptRes)
                    return {};
                if (!e)
                    return en(this.scriptRes.value);
                let t = {};
                if (Array.isArray(e))
                    for (let n = 0; n < e.length; n++) {
                        let r = e[n];
                        if (r in this.scriptRes.value) {
                            let e = this.scriptRes.value[r];
                            e && "object" == typeof e && (e = en(e)),
                            t[r] = e
                        }
                    }
                else
                    for (let n of Object.keys(e)) {
                        let r = e[n];
                        t[n] = eL(this, n, r)
                    }
                return t
            }
            "GM.getValues"(e) {
                return new Promise(this.scriptRes ? t => {
                    t(this.GM_getValues(e))
                }
                : () => {}
                )
            }
            "GM.setValues"(e) {
                return new Promise(this.scriptRes ? t => {
                    if (!e || "object" != typeof e)
                        throw Error("GM.setValues: values must be an object");
                    ej(this, t, e)
                }
                : () => {}
                )
            }
            GM_deleteValues(e) {
                if (!this.scriptRes)
                    return;
                if (!Array.isArray(e))
                    return void console.warn("GM_deleteValues: keys must be string[]");
                let t = {};
                for (let n of e)
                    t[n] = void 0;
                ej(this, null, t)
            }
            "GM.deleteValues"(e) {
                return new Promise(this.scriptRes ? t => {
                    if (Array.isArray(e)) {
                        let n = {};
                        for (let t of e)
                            n[t] = void 0;
                        ej(this, t, n)
                    } else
                        throw Error("GM.deleteValues: keys must be string[]")
                }
                : () => {}
                )
            }
            GM_addValueChangeListener(e, t) {
                return this.valueChangeListener ? this.valueChangeListener.add(e, t) : 0
            }
            "GM.addValueChangeListener"(e, t) {
                return new Promise(n => {
                    n(this.GM_addValueChangeListener(e, t))
                }
                )
            }
            GM_removeValueChangeListener(e) {
                this.valueChangeListener && this.valueChangeListener.remove(e)
            }
            "GM.removeValueChangeListener"(e) {
                return new Promise(t => {
                    this.GM_removeValueChangeListener(e),
                    t()
                }
                )
            }
            GM_log(e, t="info", ...n) {
                this.isInvalidContext() || ("string" != typeof e && (e = et.jsonStringify(e)),
                this.sendMessage("GM_log", [e, t, n]))
            }
            "GM.log"(e, t="info", ...n) {
                return new Promise(r => {
                    this.GM_log(e, t, ...n),
                    r()
                }
                )
            }
            CAT_createBlobUrl(e) {
                return Promise.resolve(eM(this, e))
            }
            CAT_fetchBlob(e) {
                return this.sendMessage("CAT_fetchBlob", [e])
            }
            async CAT_fetchDocument(e) {
                if (this.isInvalidContext())
                    return;
                let t = this.message;
                return ew(this, e, !!t && t.envTag === eC.content)
            }
            static _GM_cookie(e, t, n, r) {
                n.url || n.domain || (n.url = window.location.href),
                "set" !== t && "delete" !== t || n.url || (n.url = window.location.href),
                e.sendMessage("GM_cookie", [t, n]).then(e => {
                    r && r(e, void 0)
                }
                ).catch(e => {
                    r && r(void 0, e)
                }
                )
            }
            "GM.cookie"(e, t) {
                return new Promise( (n, r) => {
                    eO(this, e, t, (e, t) => {
                        t ? r(t) : n(e)
                    }
                    )
                }
                )
            }
            "GM.cookie.set"(e) {
                return new Promise( (t, n) => {
                    eO(this, "set", e, (e, r) => {
                        r ? n(r) : t(e)
                    }
                    )
                }
                )
            }
            "GM.cookie.list"(e) {
                return new Promise( (t, n) => {
                    eO(this, "list", e, (e, r) => {
                        r ? n(r) : t(e)
                    }
                    )
                }
                )
            }
            "GM.cookie.delete"(e) {
                return new Promise( (t, n) => {
                    eO(this, "delete", e, (e, r) => {
                        r ? n(r) : t(e)
                    }
                    )
                }
                )
            }
            "GM_cookie.set"(e, t) {
                eO(this, "set", e, t)
            }
            "GM_cookie.list"(e, t) {
                eO(this, "list", e, t)
            }
            "GM_cookie.delete"(e, t) {
                eO(this, "delete", e, t)
            }
            GM_cookie(e, t, n) {
                eO(this, e, t, n)
            }
            menuKeyRegistered;
            menuIdCounter;
            regMenuCounter;
            contentEnvKey;
            GM_registerMenuCommand(e, t, n) {
                if (!this.EE)
                    return -1;
                this.contentEnvKey || (this.contentEnvKey = `-${Date.now().toString(36)}.${W(8e11, 2e12).toString(36)}`,
                this.menuKeyRegistered = new Set,
                this.menuIdCounter = 0,
                this.regMenuCounter = 0),
                this.regMenuCounter += 1,
                n || "object" != typeof t || (n = t,
                t = void 0);
                let r = "string" == typeof n ? {
                    accessKey: n
                } : n ? {
                    ...n,
                    id: void 0,
                    individual: void 0
                } : {}
                  , o = !t && !e
                  , s = "object" == typeof n ? n.individual : void 0;
                void 0 === s && o && (s = !0),
                r.mIndividualKey = s ? this.regMenuCounter : 0,
                void 0 === r.autoClose && (r.autoClose = !0),
                void 0 === r.nested && (r.nested = !0),
                o ? (r.mSeparator = !0,
                e = "",
                t = void 0) : r.mSeparator = !1;
                let a = "object" == typeof n ? n.id : void 0;
                void 0 === a && (a = this.menuIdCounter += 1);
                let i = a;
                a = `t${a}`;
                let l = a = `${this.contentEnvKey}.${a}`;
                return l && this.menuKeyRegistered.has(l) ? this.EE.removeAllListeners("menuClick:" + l) : this.menuKeyRegistered.add(l),
                t && this.EE.addListener("menuClick:" + l, t),
                this.sendMessage("GM_registerMenuCommand", [l, e, r]),
                i
            }
            "GM.registerMenuCommand"(e, t, n) {
                return new Promise(r => {
                    r(this.GM_registerMenuCommand(e, t, n))
                }
                )
            }
            CAT_registerMenuInput(...e) {
                return this.GM_registerMenuCommand(...e)
            }
            GM_addStyle(e) {
                if (!this.message || !this.scriptRes)
                    return;
                if ("string" != typeof e)
                    throw Error("The parameter 'css' of GM_addStyle shall be a string.");
                let t = this.contentMsg.syncSendMessage({
                    action: "content/runtime/addElement",
                    data: {
                        params: [null, "style", {
                            textContent: e
                        }]
                    }
                });
                if (t.code)
                    throw Error(t.message);
                return this.contentMsg.getAndDelRelatedTarget(t.data)
            }
            "GM.addStyle"(e) {
                return new Promise(t => {
                    t(this.GM_addStyle(e))
                }
                )
            }
            GM_addElement(e, t, n={}) {
                let r;
                if (!this.message || !this.scriptRes)
                    return;
                if ("string" != typeof e ? r = this.contentMsg.sendRelatedTarget(e) : (r = null,
                n = t || {},
                t = e),
                "string" != typeof t)
                    throw Error("The parameter 'tagName' of GM_addElement shall be a string.");
                if (null !== n && "object" != typeof n)
                    throw Error("The parameter 'attrs' of GM_addElement shall be an object.");
                let o = {}
                  , s = {};
                for (let[e,t] of Object.entries(n))
                    "string" == typeof t || "number" == typeof t ? o[e] = t : s[e] = t;
                let a = this.contentMsg.syncSendMessage({
                    action: "content/runtime/addElement",
                    data: {
                        params: [r, t, o]
                    }
                });
                if (a.code)
                    throw Error(a.message);
                let i = this.contentMsg.getAndDelRelatedTarget(a.data);
                for (let[e,t] of Object.entries(s))
                    i[e] = t;
                return i
            }
            "GM.addElement"(e, t, n={}) {
                return new Promise(r => {
                    r(this.GM_addElement(e, t, n))
                }
                )
            }
            GM_unregisterMenuCommand(e) {
                if (!this.EE || !this.contentEnvKey)
                    return;
                let t = `t${e}`;
                t = `${this.contentEnvKey}.${t}`,
                this.menuKeyRegistered.delete(t),
                this.EE.removeAllListeners("menuClick:" + t),
                this.sendMessage("GM_unregisterMenuCommand", [t])
            }
            "GM.unregisterMenuCommand"(e) {
                return new Promise(t => {
                    this.GM_unregisterMenuCommand(e),
                    t()
                }
                )
            }
            CAT_unregisterMenuInput(...e) {
                this.GM_unregisterMenuCommand(...e)
            }
            CAT_userConfig() {
                return this.sendMessage("CAT_userConfig", [])
            }
            async CAT_fileStorage(e, t) {
                if ("config" === e)
                    return void this.sendMessage("CAT_fileStorage", ["config"]);
                let n = {
                    baseDir: t.baseDir || "",
                    path: t.path || "",
                    filename: t.filename,
                    file: t.file
                };
                "upload" === e && (n.data = await eM(this, t.data)),
                this.sendMessage("CAT_fileStorage", [e, n]).then(async n => {
                    switch (n.action) {
                    case "onload":
                        if ("download" === e) {
                            let e = await this.CAT_fetchBlob(n.data);
                            t.onload && t.onload(e)
                        } else
                            t.onload && t.onload(n.data);
                        break;
                    case "error":
                        if (void 0 === n.data.code) {
                            t.onerror && t.onerror({
                                code: -1,
                                message: n.data.message
                            });
                            return
                        }
                        t.onerror && t.onerror(n.data)
                    }
                }
                )
            }
            GM_xmlhttpRequest(e) {
                let {abort: t} = eG(this, e, !1);
                return {
                    abort: t
                }
            }
            "GM.xmlHttpRequest"(e) {
                let {retPromise: t, abort: n} = eG(this, e, !0);
                return t.abort = n,
                t
            }
            static _GM_download(e, t, n) {
                let r, o, s;
                if (e.isInvalidContext())
                    return {
                        retPromise: n ? Promise.reject("GM_download: Invalid Context") : null,
                        abort: () => {}
                    };
                let a = n ? new Promise( (e, t) => {
                    r = e,
                    o = t
                }
                ) : null
                  , i = "object" == typeof t.url ? ev(t.url) : t.url
                  , l = !1
                  , c = null
                  , d = t.context
                  , u = e => {
                    let t = {
                        ...e
                    };
                    return e?.data && (t.data = e.data),
                    void 0 !== d && (t.context = d),
                    t
                }
                ;
                return (async () => {
                    let n = await i
                      , a = t.downloadMode || "native";
                    if (t.url = n,
                    "browser" === a || n.startsWith("blob:")) {
                        if ("string" == typeof t.user && t.user)
                            try {
                                let e = new URL(t.url)
                                  , n = `${encodeURIComponent(t.user)}`
                                  , r = t.password ? `:${encodeURIComponent(t.password)}` : "";
                                t.url = `${e.protocol}//${n}${r}@${e.host}${e.pathname}${e.search}${e.hash}`
                            } catch {}
                        let a = await e.connect("GM_download", [{
                            method: t.method,
                            downloadMode: "browser",
                            url: n,
                            name: t.name,
                            headers: t.headers,
                            saveAs: t.saveAs,
                            conflictAction: t.conflictAction,
                            timeout: t.timeout,
                            cookie: t.cookie,
                            anonymous: t.anonymous
                        }]);
                        if (l)
                            return;
                        (s = a).onMessage(e => {
                            switch (e.action) {
                            case "onload":
                                t.onload?.(u({
                                    ...e.data
                                })),
                                r?.(e.data);
                                break;
                            case "onprogress":
                                t.onprogress?.(u({
                                    ...e.data,
                                    mode: "browser"
                                })),
                                o?.(Error("Timeout ERROR"));
                                break;
                            case "ontimeout":
                                t.ontimeout?.(u({})),
                                o?.(Error("Timeout ERROR"));
                                break;
                            case "onerror":
                                t.onerror?.(u({
                                    error: "unknown"
                                })),
                                o?.(Error("Unknown ERROR"));
                                break;
                            default:
                                m.logger().warn("GM_download resp is error", {
                                    data: e
                                }),
                                o?.(Error("Unexpected Internal ERROR"))
                            }
                        }
                        )
                    } else {
                        let a = {
                            url: n,
                            fetch: !0,
                            responseType: "blob",
                            onloadend: async n => {
                                if (!l && n.response instanceof Blob) {
                                    let a = URL.createObjectURL(n.response)
                                      , i = await e.connect("GM_download", [{
                                        method: t.method,
                                        downloadMode: "browser",
                                        url: a,
                                        name: t.name,
                                        headers: t.headers,
                                        saveAs: t.saveAs,
                                        conflictAction: t.conflictAction,
                                        timeout: t.timeout,
                                        cookie: t.cookie,
                                        anonymous: t.anonymous
                                    }]);
                                    l || (s = i).onMessage(e => {
                                        switch (e.action) {
                                        case "onload":
                                            t.onload?.(u({
                                                ...e.data
                                            })),
                                            r?.(e.data),
                                            setTimeout( () => {
                                                URL.revokeObjectURL(a)
                                            }
                                            , 1);
                                            break;
                                        case "ontimeout":
                                            t.ontimeout?.(u({})),
                                            o?.(Error("Timeout ERROR"));
                                            break;
                                        case "onerror":
                                            t.onerror?.(u({
                                                error: "unknown"
                                            })),
                                            o?.(Error("Unknown ERROR"));
                                            break;
                                        default:
                                            m.logger().warn("GM_download resp is error", {
                                                data: e
                                            }),
                                            o?.(Error("Unexpected Internal ERROR"))
                                        }
                                    }
                                    )
                                }
                            }
                            ,
                            onload: () => {}
                            ,
                            onprogress: e => {
                                t.onprogress?.(u({
                                    ...e,
                                    mode: "native"
                                }))
                            }
                            ,
                            ontimeout: () => {
                                t.ontimeout?.(u({}))
                            }
                            ,
                            onerror: () => {
                                t.onerror?.(u({
                                    error: "unknown"
                                }))
                            }
                        };
                        "object" == typeof t.headers && (a.headers = t.headers),
                        "string" == typeof t.method && (a.method = t.method || "GET"),
                        "number" == typeof t.timeout && (a.timeout = t.timeout),
                        "string" == typeof t.cookie && (a.cookie = t.cookie),
                        "boolean" == typeof t.anonymous && (a.anonymous = t.anonymous),
                        "string" == typeof t.user && t.user && (a.user = t.user,
                        a.password = t.password || "");
                        let {retPromise: i, abort: d} = eG(e, a, !0, !0);
                        i?.catch( () => {
                            l || o?.(Error("Native Download ERROR"))
                        }
                        ),
                        c = d
                    }
                }
                )().catch(console.error),
                {
                    retPromise: a,
                    abort: () => {
                        l = !0,
                        s?.disconnect(),
                        c?.()
                    }
                }
            }
            GM_download(e, t) {
                let {abort: n} = e$(this, "string" == typeof e ? {
                    url: e,
                    name: t
                } : {
                    ...e
                }, !1);
                return {
                    abort: n
                }
            }
            "GM.download"(e, t) {
                let {retPromise: n, abort: r} = e$(this, "string" == typeof e ? {
                    url: e,
                    name: t
                } : {
                    ...e
                }, !0);
                return n.abort = r,
                n
            }
            static _GM_notification(e, t, n, r, o) {
                let s, a, i, l, c;
                if (e.isInvalidContext())
                    return Promise.resolve();
                let d = e.notificationTagMap || (e.notificationTagMap = new Map);
                if (e.eventId += 1,
                "string" == typeof t)
                    switch ((s = {}).text = t,
                    arguments.length) {
                    case 4:
                        s.onclick = o;
                    case 3:
                        s.image = r;
                    case 2:
                        s.title = n
                    }
                else
                    (s = Object.assign({}, t)).ondone = s.ondone || n;
                return s.onclick && (a = s.onclick,
                delete s.onclick),
                s.ondone && (i = s.ondone,
                delete s.ondone),
                s.oncreate && (l = s.oncreate,
                delete s.oncreate),
                "string" == typeof s.tag && (c = d.get(s.tag)),
                e.sendMessage("GM_notification", [s, c]).then(t => {
                    if (!e.EE)
                        return;
                    l && l.apply({
                        id: t
                    }, [t]),
                    "string" == typeof s.tag && d.set(s.tag, t);
                    let n = !1;
                    e.EE.addListener("GM_notification:" + t, r => {
                        if (e.EE)
                            switch (r.event) {
                            case "click":
                            case "buttonClick":
                                {
                                    let e = {
                                        event: r.event,
                                        id: t,
                                        isButtonClick: "buttonClick" === r.event,
                                        buttonClickIndex: r.params.index,
                                        byUser: r.params.byUser,
                                        preventDefault: function() {
                                            n = !0
                                        },
                                        highlight: s.highlight,
                                        image: s.image,
                                        silent: s.silent,
                                        tag: s.tag,
                                        text: s.tag,
                                        timeout: s.timeout,
                                        title: s.title,
                                        url: s.url
                                    };
                                    a && a.apply({
                                        id: t
                                    }, [e]),
                                    i && i.apply({
                                        id: t
                                    }, []),
                                    n || "string" != typeof s.url || (window.open(s.url, "_blank"),
                                    m.logger().info("GM_notification open url: " + s.url, {
                                        data: s
                                    }));
                                    break
                                }
                            case "close":
                                i && i.apply({
                                    id: t
                                }, [r.params.byUser]),
                                "string" == typeof s.tag && d.delete(s.tag),
                                e.EE.removeAllListeners("GM_notification:" + e.eventId);
                                break;
                            default:
                                m.logger().warn("GM_notification resp is error", {
                                    resp: r
                                })
                            }
                    }
                    )
                }
                ),
                Promise.resolve()
            }
            async "GM.notification"(e, t, n, r) {
                return eD(this, e, t, n, r)
            }
            GM_notification(e, t, n, r) {
                eD(this, e, t, n, r)
            }
            GM_closeNotification(e) {
                this.sendMessage("GM_closeNotification", [e])
            }
            GM_updateNotification(e, t) {
                this.sendMessage("GM_updateNotification", [e, t])
            }
            GM_openInTab(e, t) {
                let n;
                if (this.isInvalidContext())
                    return;
                let r = {};
                "boolean" == typeof t ? r.active = !t : t && (r = {
                    ...t
                }),
                "boolean" != typeof r.active && "boolean" == typeof r.loadInBackground ? r.active = !r.loadInBackground : void 0 === r.active && (r.active = !0),
                void 0 === r.insert && (r.insert = !0),
                void 0 === r.setParent && (r.setParent = !0);
                let o = {
                    close: () => {
                        n && this.GM_closeInTab(n)
                    }
                    ,
                    closed: !1,
                    onclose() {}
                };
                return this.sendMessage("GM_openInTab", [e, r]).then(e => {
                    this.EE && (e ? (n = e,
                    this.EE.addListener("GM_openInTab:" + e, t => {
                        if (this.EE)
                            switch (t.event) {
                            case "oncreate":
                                n = t.tabId;
                                break;
                            case "onclose":
                                o.onclose && o.onclose(),
                                o.closed = !0,
                                this.EE.removeAllListeners("GM_openInTab:" + e);
                                break;
                            default:
                                m.logger().warn("GM_openInTab resp is error", {
                                    resp: t
                                })
                            }
                    }
                    )) : (o.onclose && o.onclose(),
                    o.closed = !0))
                }
                ),
                o
            }
            "GM.openInTab"(e, t) {
                return new Promise(n => {
                    n(this.GM_openInTab(e, t))
                }
                )
            }
            GM_closeInTab(e) {
                if (!this.isInvalidContext())
                    return this.sendMessage("GM_closeInTab", [e])
            }
            GM_getTab(e) {
                this.isInvalidContext() || this.sendMessage("GM_getTab", []).then(t => {
                    e(t ?? {})
                }
                )
            }
            "GM.getTab"() {
                return new Promise(e => {
                    this.GM_getTab(t => {
                        e(t)
                    }
                    )
                }
                )
            }
            GM_saveTab(e) {
                this.isInvalidContext() || ("object" == typeof e && (e = en(e)),
                this.sendMessage("GM_saveTab", [e]))
            }
            "GM.saveTab"(e) {
                return new Promise(t => {
                    this.GM_saveTab(e),
                    t()
                }
                )
            }
            GM_getTabs(e) {
                this.isInvalidContext() || this.sendMessage("GM_getTabs", []).then(t => {
                    e(t)
                }
                )
            }
            "GM.getTabs"() {
                return new Promise(e => {
                    this.GM_getTabs(t => {
                        e(t)
                    }
                    )
                }
                )
            }
            GM_setClipboard(e, t, n) {
                let r;
                this.isInvalidContext() || ("object" == typeof t && t?.mimetype ? r = t.mimetype : "text" === (r = ("string" == typeof t ? t : t?.type) || "text/plain") ? r = "text/plain" : "html" === r && (r = "text/html"),
                e = `${e}`,
                this.sendMessage("GM_setClipboard", [e, r]).then( () => {
                    "function" == typeof n && n()
                }
                ).catch( () => {
                    "function" == typeof n && n()
                }
                ))
            }
            "GM.setClipboard"(e, t) {
                return new Promise(this.isInvalidContext() ? () => {}
                : n => {
                    this.GM_setClipboard(e, t, () => {
                        n()
                    }
                    )
                }
                )
            }
            GM_getResourceText(e) {
                let t = this.scriptRes?.resource?.[e];
                if (t)
                    return t.content
            }
            "GM.getResourceText"(e) {
                return new Promise(t => {
                    t(this.GM_getResourceText(e))
                }
                )
            }
            GM_getResourceURL(e, t) {
                let n = this.scriptRes?.resource?.[e];
                if (n) {
                    let e = n.base64;
                    return (e || (e = `data:${n.contentType};base64,${btoa(encodeURIComponent(n.content).replace(/%([0-9A-F]{2})/g, (e, t) => String.fromCharCode(parseInt(`0x${t}`, 16))))}`),
                    t) ? URL.createObjectURL(function(e) {
                        let t = e.split(",")[0].split(":")[1].split(";")[0]
                          , n = atob(e.split(",")[1])
                          , r = new Uint8Array(new ArrayBuffer(n.length));
                        for (let e = 0; e < n.length; e += 1)
                            r[e] = n.charCodeAt(e);
                        return new Blob([r],{
                            type: t
                        })
                    }(e)) : e
                }
            }
            "GM.getResourceUrl"(e, t) {
                return new Promise(n => {
                    n(this.GM_getResourceURL(e, t))
                }
                )
            }
            "window.close"() {
                return this.sendMessage("window.close", [])
            }
            "window.focus"() {
                return this.sendMessage("window.focus", [])
            }
            apiLoadPromise;
            CAT_scriptLoaded() {
                return this.loadScriptPromise
            }
        }
        ee([z.API()], eS.prototype, "GM_getValue", null),
        ee([z.API()], eS.prototype, "GM.getValue", null),
        ee([z.API()], eS.prototype, "GM_setValue", null),
        ee([z.API()], eS.prototype, "GM.setValue", null),
        ee([z.API()], eS.prototype, "GM_deleteValue", null),
        ee([z.API()], eS.prototype, "GM.deleteValue", null),
        ee([z.API()], eS.prototype, "GM_listValues", null),
        ee([z.API()], eS.prototype, "GM.listValues", null),
        ee([z.API()], eS.prototype, "GM_setValues", null),
        ee([z.API()], eS.prototype, "GM_getValues", null),
        ee([z.API({
            depend: ["GM_getValues"]
        })], eS.prototype, "GM.getValues", null),
        ee([z.API()], eS.prototype, "GM.setValues", null),
        ee([z.API()], eS.prototype, "GM_deleteValues", null),
        ee([z.API()], eS.prototype, "GM.deleteValues", null),
        ee([z.API()], eS.prototype, "GM_addValueChangeListener", null),
        ee([z.API({
            depend: ["GM_addValueChangeListener"]
        })], eS.prototype, "GM.addValueChangeListener", null),
        ee([z.API()], eS.prototype, "GM_removeValueChangeListener", null),
        ee([z.API({
            depend: ["GM_removeValueChangeListener"]
        })], eS.prototype, "GM.removeValueChangeListener", null),
        ee([z.API()], eS.prototype, "GM_log", null),
        ee([z.API({
            depend: ["GM_log"]
        })], eS.prototype, "GM.log", null),
        ee([z.API()], eS.prototype, "CAT_createBlobUrl", null),
        ee([z.API()], eS.prototype, "CAT_fetchBlob", null),
        ee([z.API()], eS.prototype, "CAT_fetchDocument", null),
        ee([z.API()], eS.prototype, "GM.cookie", null),
        ee([z.API({
            follow: "GM.cookie"
        })], eS.prototype, "GM.cookie.set", null),
        ee([z.API({
            follow: "GM.cookie"
        })], eS.prototype, "GM.cookie.list", null),
        ee([z.API({
            follow: "GM.cookie"
        })], eS.prototype, "GM.cookie.delete", null),
        ee([z.API({
            follow: "GM_cookie"
        })], eS.prototype, "GM_cookie.set", null),
        ee([z.API({
            follow: "GM_cookie"
        })], eS.prototype, "GM_cookie.list", null),
        ee([z.API({
            follow: "GM_cookie"
        })], eS.prototype, "GM_cookie.delete", null),
        ee([z.API()], eS.prototype, "GM_cookie", null),
        ee([z.API()], eS.prototype, "GM_registerMenuCommand", null),
        ee([z.API({
            depend: ["GM_registerMenuCommand"]
        })], eS.prototype, "GM.registerMenuCommand", null),
        ee([z.API({
            depend: ["GM_registerMenuCommand"]
        })], eS.prototype, "CAT_registerMenuInput", null),
        ee([z.API()], eS.prototype, "GM_addStyle", null),
        ee([z.API({
            depend: ["GM_addStyle"]
        })], eS.prototype, "GM.addStyle", null),
        ee([z.API()], eS.prototype, "GM_addElement", null),
        ee([z.API({
            depend: ["GM_addElement"]
        })], eS.prototype, "GM.addElement", null),
        ee([z.API()], eS.prototype, "GM_unregisterMenuCommand", null),
        ee([z.API({
            depend: ["GM_unregisterMenuCommand"]
        })], eS.prototype, "GM.unregisterMenuCommand", null),
        ee([z.API({
            depend: ["GM_unregisterMenuCommand"]
        })], eS.prototype, "CAT_unregisterMenuInput", null),
        ee([z.API()], eS.prototype, "CAT_userConfig", null),
        ee([z.API({
            depend: ["CAT_fetchBlob"]
        })], eS.prototype, "CAT_fileStorage", null),
        ee([z.API()], eS.prototype, "GM_xmlhttpRequest", null),
        ee([z.API()], eS.prototype, "GM.xmlHttpRequest", null),
        ee([z.API()], eS.prototype, "GM_download", null),
        ee([z.API()], eS.prototype, "GM.download", null),
        ee([z.API()], eS.prototype, "GM.notification", null),
        ee([z.API()], eS.prototype, "GM_notification", null),
        ee([z.API({
            alias: "GM.closeNotification"
        })], eS.prototype, "GM_closeNotification", null),
        ee([z.API({
            alias: "GM.updateNotification"
        })], eS.prototype, "GM_updateNotification", null),
        ee([z.API({
            depend: ["GM_closeInTab"]
        })], eS.prototype, "GM_openInTab", null),
        ee([z.API({
            depend: ["GM_openInTab", "GM_closeInTab"]
        })], eS.prototype, "GM.openInTab", null),
        ee([z.API({
            alias: "GM.closeInTab"
        })], eS.prototype, "GM_closeInTab", null),
        ee([z.API()], eS.prototype, "GM_getTab", null),
        ee([z.API({
            depend: ["GM_getTab"]
        })], eS.prototype, "GM.getTab", null),
        ee([z.API()], eS.prototype, "GM_saveTab", null),
        ee([z.API({
            depend: ["GM_saveTab"]
        })], eS.prototype, "GM.saveTab", null),
        ee([z.API()], eS.prototype, "GM_getTabs", null),
        ee([z.API({
            depend: ["GM_getTabs"]
        })], eS.prototype, "GM.getTabs", null),
        ee([z.API()], eS.prototype, "GM_setClipboard", null),
        ee([z.API({
            depend: ["GM_setClipboard"]
        })], eS.prototype, "GM.setClipboard", null),
        ee([z.API()], eS.prototype, "GM_getResourceText", null),
        ee([z.API({
            depend: ["GM_getResourceText"]
        })], eS.prototype, "GM.getResourceText", null),
        ee([z.API()], eS.prototype, "GM_getResourceURL", null),
        ee([z.API({
            depend: ["GM_getResourceURL"]
        })], eS.prototype, "GM.getResourceUrl", null),
        ee([z.API()], eS.prototype, "window.close", null),
        ee([z.API()], eS.prototype, "window.focus", null),
        ee([z.protected()], eS.prototype, "apiLoadPromise", void 0),
        ee([z.API()], eS.prototype, "CAT_scriptLoaded", null);
        let {createGMBase: ek} = eP
          , {_GM_getValue: eL, _GM_cookie: eO, _GM_setValue: eU, _GM_setValues: ej, _GM_download: e$, _GM_notification: eD} = eS
          , eF = (t = "propertyIsEnumerable",
        r = (n = `${Object[t]}`).indexOf(t),
        o = n.indexOf("()"),
        s = n.lastIndexOf("("),
        r > 0 && o > 0 && s === o ? [n.substring(0, r), n.substring(r + t.length)] : null)
          , eN = new Set(["eval", "window", "self", "globalThis", "top", "parent"])
          , eV = Object.getOwnPropertyDescriptors(p.g)
          , eB = {}
          , eH = {};
        for (var eY = p.g, eW = ([e,t]) => {
            if (!(!t || eN.has(e)) && "string" == typeof e)
                if (t.writable) {
                    let n = t.value;
                    if ((e => {
                        if ("function" != typeof e || "prototype"in e)
                            return !1;
                        let {name: t} = e;
                        if (!t)
                            return !1;
                        let n = t.charCodeAt(0);
                        if (n >= 97 && n <= 122 && !t.includes(" "))
                            if (!eF?.[1])
                                return !0;
                            else {
                                let n = `${e}`;
                                if (n === `${eF[0]}${t}${eF[1]}` || n === `${eF[0]}${eF[1]}`)
                                    return !0
                            }
                        return !1
                    }
                    )(n)) {
                        let r = n.bind(p.g);
                        eB[e] = {
                            ...t,
                            value: r
                        },
                        eN.add(e)
                    }
                } else
                    t.configurable && t.get && t.set && t.enumerable && e.startsWith("on") ? eH[e] = t : (t.get || t.set) && (eB[e] = {
                        ...t,
                        get: t?.get?.bind(p.g),
                        set: t?.set?.bind(p.g)
                    },
                    eN.add(e))
        }
        ; eY && eY !== Object; )
            Object.entries(Object.getOwnPropertyDescriptors(eY)).forEach(eW),
            eY = Object.getPrototypeOf(eY);
        eN.clear();
        let eq = (class {
        }
        ).prototype;
        Object.defineProperty(eq, Symbol.toStringTag, {
            value: p.g[Symbol.toStringTag],
            writable: !1,
            enumerable: !1,
            configurable: !0
        }),
        Object.defineProperty(eq, "constructor", {
            value: p.g.constructor,
            writable: !1,
            enumerable: !1,
            configurable: !0
        }),
        Object.defineProperty(eq, "__proto__", {
            value: p.g.__proto__,
            writable: !1,
            enumerable: !1,
            configurable: !0
        });
        let eK = Object.create(null, {
            ...Object.getOwnPropertyDescriptors(eq),
            ...eV,
            ...eB
        })
          , eX = Object.getOwnPropertyDescriptors(console)
          , eJ = Object.getPrototypeOf(console)
          , ez = ["scriptcat.org", "greasyfork.org", "sleazyfork.org", "tampermonkey.net.cn", "openuserjs.org"];
        class eQ {
            scriptRes;
            scriptFunc;
            logger;
            sandboxContext;
            named;
            constructor(e, t) {
                let n, {envPrefix: r, message: o, contentMsg: s, code: a, envInfo: i, globalInjection: l} = t;
                this.scriptRes = e,
                this.logger = m.getInstance().logger({
                    component: "exec",
                    uuid: e.uuid,
                    name: e.name
                });
                let c = (n = {
                    description: e.metadata.description?.[0] || null,
                    matches: e.metadata.match || [],
                    includes: e.metadata.include || [],
                    "run-at": e.metadata["run-at"]?.[0] || "document-idle",
                    "run-in": e.metadata["run-in"] || [],
                    icon: e.metadata.icon?.[0] || null,
                    icon64: e.metadata.icon64?.[0] || null,
                    header: e.metadataStr,
                    grant: e.metadata.grant || [],
                    connects: e.metadata.connect || []
                },
                {
                    downloadMode: "native",
                    isIncognito: i.isIncognito,
                    sandboxMode: i.sandboxMode,
                    scriptWillUpdate: !!e.checkUpdate,
                    scriptHandler: "ScriptCat",
                    userAgentData: i.userAgentData,
                    scriptUpdateURL: e.downloadUrl || null,
                    scriptMetaStr: e.metadataStr,
                    userConfig: e.userConfig,
                    userConfigStr: e.userConfigStr,
                    version: "1.3.2",
                    script: {
                        name: e.name,
                        namespace: e.namespace,
                        version: e.metadata.version?.[0] || "0.0",
                        author: e.author,
                        lastModified: e.updatetime,
                        downloadURL: e.downloadUrl || null,
                        updateURL: e.checkUpdateUrl || null,
                        ...n
                    }
                });
                "string" == typeof a ? this.scriptFunc = Function(a) : this.scriptFunc = a;
                let d = new Set(e.metadata.grant || []);
                d.has("none") ? this.named = {
                    GM: {
                        info: c
                    },
                    GM_info: c
                } : (this.sandboxContext = ( (e, t, n, r, o, s) => {
                    var a, i;
                    let l, c, d, u = new Z, p = new _;
                    i = a = e.metadata,
                    ("" === (d = i["early-start"]?.[0]) || "true" === d) && a["run-at"]?.[0] === "document-start" && (l = new Promise(e => {
                        c = e
                    }
                    ));
                    let h = !1
                      , g = ek({
                        prefix: n,
                        message: r,
                        contentMsg: o,
                        scriptRes: e,
                        valueChangeListener: u,
                        EE: p,
                        runFlag: w(),
                        eventId: 1e4,
                        GM: {
                            info: t
                        },
                        GM_info: t,
                        window: {},
                        grantSet: new Set,
                        loadScriptPromise: l,
                        loadScriptResolve: c,
                        setInvalidContext() {
                            h || (h = !0,
                            this.valueChangeListener.clear(),
                            this.EE.removeAllListeners(),
                            this.runFlag = `${w()}(invalid)`,
                            this.message = null,
                            this.scriptRes = null,
                            this.valueChangeListener = null,
                            this.EE = null)
                        },
                        isInvalidContext: () => h
                    })
                      , f = {}
                      , m = e => {
                        let t = g.grantSet
                          , n = K.get(e);
                        if (!n)
                            return !1;
                        if (t.has(e))
                            return !0;
                        for (let {fnKey: r, api: o, param: s} of (t.add(e),
                        n)) {
                            f[r] = o.bind(g);
                            let e = s?.depend;
                            if (e)
                                for (let t of e)
                                    m(t)
                        }
                        return !0
                    }
                    ;
                    for (let e of s)
                        m(e),
                        e.startsWith("GM.") ? m(e.replace("GM.", "GM_")) : e.startsWith("GM_") && m(e.replace("GM_", "GM."));
                    for (let e of Object.keys(f)) {
                        let t = e.split(".")
                          , n = t.length
                          , r = g
                          , o = "";
                        for (let e = 0; e < n; e++) {
                            let n = t[e];
                            o += `${e ? "." : ""}${n}`,
                            r = r[n] || (r[n] = f[o] || {})
                        }
                    }
                    return g.unsafeWindow = window,
                    g
                }
                )(e, c, r, o, s, d),
                l && Object.assign(this.sandboxContext, l))
            }
            emitEvent(e, t, n) {
                this.logger.debug("emit event", {
                    event: e,
                    eventId: t,
                    data: n
                }),
                this.sandboxContext?.emitEvent(e, t, n)
            }
            valueUpdate(e) {
                this.sandboxContext?.valueUpdate(e)
            }
            execContext;
            exec = () => {
                this.logger.debug("script start");
                let e = this.sandboxContext;
                return this.execContext = e ? (e => {
                    let t, n = Object.getOwnPropertyDescriptors(eK), r = e => function() {
                        let n = e.call(p.g);
                        return n === p.g ? t : n
                    }
                    , o = e => {
                        let n = e.slice(2)
                          , r = {
                            fn: null,
                            handleEvent(o) {
                                let s = t[e];
                                s && s === this.fn ? s.call(t, o) : (p.g.removeEventListener(n, r),
                                this.fn = null)
                            }
                        };
                        return {
                            get: () => r.fn,
                            set(e) {
                                let {fn: t} = r;
                                if (e !== t) {
                                    let o;
                                    (o = e) !== Object(o) && (e = null),
                                    typeof t != typeof e && ("function" == typeof t ? p.g.removeEventListener(n, r) : "function" == typeof e && p.g.addEventListener(n, r)),
                                    r.fn = e
                                }
                            }
                        }
                    }
                    ;
                    for (let e of Object.keys(eH)) {
                        let t = o(e);
                        n[e] = {
                            ...n[e],
                            ...t
                        }
                    }
                    for (let e of ["window", "self", "globalThis", "top", "parent"]) {
                        let o = n[e];
                        o?.value === p.g ? (o.get = function() {
                            return t
                        }
                        ,
                        o.set = void 0,
                        delete o.writable,
                        delete o.value) : o?.get && (o.get = r(o.get),
                        o.set = void 0)
                    }
                    for (let e of (n.$ = {
                        enumerable: !1,
                        configurable: !0,
                        get() {
                            return delete this.$,
                            t
                        }
                    },
                    t = Object.create(Object.getPrototypeOf(eK), n),
                    ["define", "module", "exports"]))
                        t[e] = void 0;
                    for (let n of Object.keys(e))
                        n in J || "window" === n || (t[n] = e[n]);
                    let s = e.window;
                    return s?.close && (t.close = s.close),
                    s?.focus && (t.focus = s.focus),
                    s?.onurlchange === null && (t.onurlchange = null),
                    t.console = Object.create(eJ, eX),
                    t
                }
                )(e) : p.g,
                this.scriptFunc.call(this.execContext, this.named, this.scriptRes.name)
            }
            ;
            updateEarlyScriptGMInfo(e) {
                let t;
                this.sandboxContext ? (this.sandboxContext.loadScriptResolve?.(),
                t = this.execContext.GM_info) : t = this.named?.GM_info,
                t.isIncognito = e.isIncognito,
                t.sandboxMode = e.sandboxMode,
                t.userAgentData = e.userAgentData
            }
            stop() {
                return this.logger.debug("script stop"),
                !0
            }
        }
        var eZ = ((l = {})[l.INCLUSION = 1] = "INCLUSION",
        l);
        let e0 = new Map
          , e1 = (e, t) => {
            let n = `${t.ruleTag} ${t.patternString}	${e}`
              , r = e0.get(n);
            if ("boolean" == typeof r)
                return r;
            switch (t.ruleType) {
            case 1:
                r = e6(e, t.ruleContent);
                break;
            case 2:
                r = !e6(e, t.ruleContent);
                break;
            case 3:
                r = e2(e, t.ruleContent);
                break;
            case 4:
                r = !e2(e, t.ruleContent);
                break;
            case 5:
                r = e8(e, t.ruleContent);
                break;
            case 6:
                r = !e8(e, t.ruleContent);
                break;
            default:
                throw Error("invalid ruleType")
            }
            return e0.size > 512 && e0.clear(),
            e0.set(n, r),
            r
        }
        ;
        function e6(e, t) {
            let n;
            try {
                n = new URL(e)
            } catch {
                return !1
            }
            if ("*" !== t[0] && n.protocol !== `${t[0]}:`)
                return !1;
            if (t[1]) {
                if ("." === t[1].charAt(0)) {
                    if (!`.${n.hostname}`.endsWith(`${t[1]}`))
                        return !1
                } else if (`${n.hostname}` != `${t[1]}`)
                    return !1
            }
            let r = `${n.pathname}${n.search || "?"}`
              , o = `/${t[2]}`.split("*")
              , s = 0
              , a = 0
              , i = o.length
              , l = Array(o.length - 1);
            if (!r.startsWith(`${o[0]}`))
                return !1;
            for (s = `${o[0]}`.length,
            a = 1; a < i; ) {
                if (a === i - 1 && "" === o[a]) {
                    l[a - 1] = r.substring(s),
                    s = r.length;
                    break
                }
                let e = r.indexOf(o[a], s);
                if (e < 0)
                    return !1;
                l[a - 1] = r.substring(s, e),
                s = e + o[a].length,
                a++
            }
            return s === r.length || s === r.length - 1 && "?" === r[s]
        }
        function e2(e, t) {
            let n = e.indexOf("#");
            if (n >= 0) {
                if (e.indexOf("#", n + 1) > 0)
                    try {
                        let t = new URL(e);
                        if (!e.endsWith(t.hash))
                            return !1;
                        n = e.length - t.hash.length
                    } catch {
                        return !1
                    }
                e = e.substring(0, n)
            }
            if (!e.length)
                return !1;
            let r = e
              , o = 0
              , s = 0
              , a = t.length
              , i = Array((a - 1) / 2);
            if (!r.startsWith(`${t[0]}`))
                return !1;
            o = `${t[0]}`.length;
            let l = 2;
            for (; l < a; ) {
                let e = t[l - 1]
                  , n = t[l];
                if ("*" === e) {
                    if (l === a - 1 && "" === n) {
                        i[s] = r.substring(o),
                        o = r.length;
                        break
                    }
                    if (!n)
                        throw Error("invalid or unsupported glob");
                    let e = r.indexOf(n, o);
                    if (e < 0)
                        return !1;
                    i[s] = r.substring(o, e),
                    o = e + n.length
                } else {
                    let e = o + 1;
                    if (r.substring(e, e + n.length) !== n)
                        return !1;
                    i[s] = r[o],
                    o = e + n.length
                }
                s++,
                l += 2
            }
            return o === r.length || o === r.length - 1 && "?" === r[o]
        }
        function e8(e, t) {
            return new RegExp(t[0],t[1] || "i").test(e)
        }
        let e3 = {
            userAgentData: "object" == typeof UserAgentData ? UserAgentData : {},
            sandboxMode: "raw",
            isIncognito: !1
        };
        class e4 {
            msg;
            contentMsg;
            earlyScriptFlag = new Set;
            execScriptMap = new Map;
            constructor(e, t) {
                this.msg = e,
                this.contentMsg = t
            }
            emitEvent(e) {
                let t = this.execScriptMap.get(e.uuid);
                t && t.emitEvent(e.event, e.eventId, e.data)
            }
            valueUpdate(e) {
                let {uuid: t, storageName: n} = e;
                for (let r of this.execScriptMap.values())
                    (r.scriptRes.uuid === t || q(r.scriptRes) === n) && r.valueUpdate(e)
            }
            startScripts(e, t) {
                let n = (e, n) => {
                    this.execScriptEntry({
                        scriptLoadInfo: e,
                        scriptFlag: e.flag,
                        scriptFunc: n,
                        envInfo: t
                    })
                }
                ;
                e.forEach(e => {
                    let r = e.flag;
                    if (this.earlyScriptFlag.has(r)) {
                        for (let e of this.execScriptMap.values())
                            if (e.scriptRes.flag === r)
                                return void e.updateEarlyScriptGMInfo(t)
                    }
                    !function(e, t, n) {
                        if (void 0 !== e[t]) {
                            n(e[t]),
                            delete e[t];
                            return
                        }
                        Object.defineProperty(e, t, {
                            configurable: !0,
                            set: r => {
                                delete e[t],
                                n(r)
                            }
                        })
                    }(window, r, t => {
                        n(e, t)
                    }
                    )
                }
                )
            }
            checkEarlyStartScript(e, t) {
                let n = `evt2f083f84-67ca-420c-8b33-eb2b86da7ef9.${e}`
                  , r = `${n}${I.scriptLoadComplete}`
                  , o = `${n}${I.envLoadComplete}`;
                x(r, e => {
                    let n = e.detail
                      , r = n?.scriptFlag;
                    if ("string" == typeof r) {
                        if (e.preventDefault(),
                        n.scriptInfo.scriptUrlPatterns)
                            try {
                                if (function(e, t) {
                                    let n = !1
                                      , r = !1;
                                    for (let o of t)
                                        if (o.ruleType & eZ.INCLUSION)
                                            !n && e1(e, o) && (n = !0);
                                        else if (!e1(e, o)) {
                                            r = !0;
                                            break
                                        }
                                    return !n || r
                                }(window.location.href, n.scriptInfo.scriptUrlPatterns))
                                    return
                            } catch (e) {
                                console.warn("Unexpected match error", e)
                            }
                        this.execEarlyScript(r, n.scriptInfo, t)
                    }
                }
                ),
                R(new CustomEvent(o))
            }
            execEarlyScript(e, t, n) {
                let r = window[e];
                this.execScriptEntry({
                    scriptLoadInfo: t,
                    scriptFunc: r,
                    scriptFlag: e,
                    envInfo: n
                }),
                this.earlyScriptFlag.add(e)
            }
            execScriptEntry(e) {
                let {scriptLoadInfo: t, scriptFunc: n, envInfo: r} = e
                  , o = new eQ(t,{
                    envPrefix: "scripting",
                    message: this.msg,
                    contentMsg: this.contentMsg,
                    code: n,
                    envInfo: r
                });
                this.execScriptMap.set(t.uuid, o);
                let s = t.metadata || {}
                  , a = t.resource;
                if (s["require-css"] && a)
                    for (let e of s["require-css"]) {
                        let t = a[e];
                        t && function(e) {
                            let t = new CSSStyleSheet;
                            t.replaceSync(e),
                            document.adoptedStyleSheets = document.adoptedStyleSheets.concat(t)
                        }(t.content)
                    }
                if (s["run-at"] && "document-body" === s["run-at"][0])
                    Q(o.exec);
                else
                    try {
                        o.exec()
                    } catch {}
            }
        }
        let e5 = (e, t, n) => {
            try {
                return e[t] = n,
                !0
            } catch {
                return !1
            }
        }
        ;
        class e7 {
            scripEnvTag;
            server;
            msg;
            scriptExecutor;
            constructor(e, t, n, r) {
                this.scripEnvTag = e,
                this.server = t,
                this.msg = n,
                this.scriptExecutor = r
            }
            contentInit() {
                this.server.on("runtime/addElement", e => {
                    let t, [n,r,o] = e.params, s = this.msg;
                    n && (t = s.getAndDelRelatedTarget(n));
                    let a = document.createElement(r)
                      , i = o ? {
                        ...o
                    } : {}
                      , l = "";
                    for (let e of (i.textContent && (l = i.textContent,
                    delete i.textContent),
                    Object.keys(i)))
                        a.setAttribute(e, i[e]);
                    return l && (a.textContent = l),
                    (t || document.head || document.body || document.querySelector("*")).appendChild(a),
                    s.sendRelatedTarget(a)
                }
                )
            }
            init() {
                this.server.on("runtime/emitEvent", e => {
                    this.scriptExecutor.emitEvent(e)
                }
                ),
                this.server.on("runtime/valueUpdate", e => {
                    this.scriptExecutor.valueUpdate(e)
                }
                ),
                this.server.on("pageLoad", e => {
                    this.startScripts(e.scripts, e.envInfo)
                }
                ),
                this.scriptExecutor.checkEarlyStartScript(this.scripEnvTag, e3)
            }
            startScripts(e, t) {
                this.scriptExecutor.startScripts(e, t)
            }
            externalMessage() {
                (e => {
                    let t;
                    if (t = window.location.hostname,
                    !ez.some(e => t.endsWith(e) && (t.length === e.length || t.endsWith(`.${e}`))))
                        return;
                    let n = window.external || (window.external = {})
                      , r = {
                        isInstalled(t, n, r) {
                            er(e, "scripting/script/isInstalled", {
                                name: t,
                                namespace: n
                            }).then(r)
                        }
                    };
                    e5(n, "Scriptcat", r),
                    ( (e, t) => {
                        let n = e.Tampermonkey
                          , r = n?.isInstalled
                          , o = t.isInstalled;
                        if (r && n?.getVersion && n.openOptions) {
                            try {
                                n.isInstalled = (e, t, n) => {
                                    r(e, t, r => {
                                        r?.installed ? n(r) : o(e, t, n)
                                    }
                                    )
                                }
                            } catch {}
                            return !0
                        }
                        return !1
                    }
                    )(n, r) || e5(n, "Tampermonkey", r)
                }
                )(this.msg)
            }
        }
        c = "2f083f84-67ca-420c-8b33-eb2b86da7ef9",
        a = "",
        i = e => {
            e instanceof CustomEvent && e.detail?.action == "broadcastEventFlag" && (a = e.detail.eventFlag,
            T(c, i),
            S(c, {
                action: "receivedEventFlag"
            }),
            (e => {
                let t = eC.inject
                  , n = new D(e,!1,t);
                new m({
                    writer: new y(n,"scripting/logger"),
                    consoleLevel: "none",
                    labels: {
                        env: "inject",
                        href: window.location.href
                    }
                }).logger().debug("inject start");
                let r = new H("inject",n)
                  , o = new e4(n,new D(e,!0,eC.content))
                  , s = new e7(t,r,n,o);
                s.init(),
                s.externalMessage()
            }
            )(a))
        }
        ,
        x(c, i),
        S(c, {
            action: "requestEventFlag"
        })
    }
    )();
}
)({
    "brands": [{
        "brand": "Chromium",
        "version": "142"
    }, {
        "brand": "Microsoft Edge",
        "version": "142"
    }, {
        "brand": "Not_A Brand",
        "version": "99"
    }],
    "mobile": false,
    "platform": "Windows",
    "architecture": "x86-64",
    "bitness": "64"
})
//# sourceURL=chrome-extension://liilgpjgabokdklappibcjfablkpcekh/scriptcat-inject.js
