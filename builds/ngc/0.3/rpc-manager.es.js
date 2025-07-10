var m = /* @__PURE__ */ ((a) => (a.HostNotConnected = "HostNotConnected", a.Timeout = "Timeout", a.NoHandler = "NoHandler", a.HandlerError = "HandlerError", a.Unknown = "Unknown", a))(m || {});
class l extends Error {
  constructor(e, t, n) {
    super(t), this.type = e, this.originalError = n, Object.setPrototypeOf(this, l.prototype);
  }
}
class f {
  constructor(e = {}) {
    this.instanceId = Math.random().toString(36).substring(2, 15), this.handlers = /* @__PURE__ */ new Map(), this.pendingCalls = /* @__PURE__ */ new Map(), this.messageHandler = null, this.isConnected = !1, this.connectionCallbacks = [];
    const t = e.timeout ?? 5e3;
    this.options = {
      timeout: t,
      connectTimeout: e.connectTimeout ?? t,
      callTimeout: e.callTimeout ?? t,
      isHost: e.isHost ?? !1,
      targetOrigin: e.targetOrigin ?? "*",
      onError: e.onError
    }, this.handleMessage = this.handleMessage.bind(this), this.onError = e.onError, this.options.targetOrigin === "*" && console.warn(
      "[RPC] Warning: targetOrigin is set to '*', which allows all origins. This is not recommended for production environments."
    );
  }
  registerHandler(e, t) {
    this.handlers.set(e, t), console.debug(
      `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Registered handler for event: ${e}`
    );
  }
  unregisterHandler(e) {
    this.handlers.delete(e), console.debug(
      `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Unregistered handler for event: ${e}`
    );
  }
  onConnectionChange(e) {
    this.connectionCallbacks.push(e), e(this.isConnected);
  }
  notifyConnectionChange(e) {
    this.isConnected !== e && (this.isConnected = e, console.debug(
      `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Connection status changed: ${e ? "Connected" : "Disconnected"}`
    ), this.connectionCallbacks.forEach((t) => t(e)));
  }
  async connect() {
    if (this.options.isHost)
      throw new Error("Host cannot initiate connection");
    return this.isConnected ? (console.debug("[RPC-CLIENT] Already connected to host"), Promise.resolve()) : (console.debug("[RPC-CLIENT] Starting connection to host..."), new Promise((e, t) => {
      const n = setTimeout(() => {
        t(new Error("RPC connection timeout"));
      }, this.options.connectTimeout), s = () => {
        clearTimeout(n);
      }, o = (i) => {
        i.data?.type === "rpc-connect" && i.data?.connected && (console.debug(
          "[RPC-CLIENT] Received connection confirmation from host"
        ), s(), this.notifyConnectionChange(!0), window.removeEventListener("message", o), e());
      };
      window.addEventListener("message", o), this.postMessage({
        type: "rpc-connect"
      }), console.debug("[RPC-CLIENT] Sent connection request to host");
    }));
  }
  /**
   * Calls a remote event. If the host has not implemented the requested function,
   * resolves to defaultValue (if provided), otherwise rejects.
   * @param event The event name
   * @param data Data to send
   * @param options Optional: { timeout, defaultValue }
   */
  async callRemote(e, t, n) {
    if (!this.isConnected) {
      const c = new l(
        "HostNotConnected",
        "RPC not connected. Call connect() first."
      );
      return new Promise((d, h) => {
        this.handleErrorOrReject(
          c,
          {
            event: e,
            data: t,
            defaultValue: typeof n == "object" && n ? n.defaultValue : void 0,
            timeout: typeof n == "object" && n ? n.timeout : void 0
          },
          d,
          h
        );
      });
    }
    let s, o;
    const i = this.options.callTimeout ?? 5e3;
    typeof n == "number" ? s = n : typeof n == "object" && n !== null ? (s = n.timeout ?? i, o = n.defaultValue) : s = i;
    const r = `rpc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return new Promise((c, d) => {
      let h = null;
      s > 0 && (h = setTimeout(() => {
        this.pendingCalls.delete(r);
        const C = new l(
          "Timeout",
          `RPC call to '${e}' timed out after ${s}ms`
        );
        this.handleErrorOrReject(
          C,
          { event: e, data: t, defaultValue: o, timeout: s },
          c,
          d
        );
      }, s));
      const g = { resolve: c, reject: d, timeout: h };
      g.defaultValue = o, this.pendingCalls.set(r, g);
      const u = {
        type: "rpc-call",
        id: r,
        event: e,
        data: t
      };
      this.postMessage(u), console.debug(
        `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Called remote event: ${e}`,
        {
          id: r,
          data: t,
          timeout: s === 0 ? "infinite" : `${s}ms`,
          defaultValue: o
        }
      );
    });
  }
  async handleErrorOrReject(e, t, n, s) {
    if (this.onError) {
      await this.onError(e, t, n, s);
      return;
    }
    if (s) {
      s(e);
      return;
    }
    throw e;
  }
  postMessage(e) {
    const t = {
      ...e,
      senderInstanceId: this.instanceId,
      senderIsHost: this.options.isHost
    };
    let n, s;
    if (this.options.isHost) {
      const i = window.frames[0];
      i && i !== window ? (n = i, s = "iframe") : (n = window, s = "same-window");
    } else
      window.parent && window.parent !== window ? (n = window.parent, s = "parent-window") : (n = window, s = "same-window");
    const o = this.options.targetOrigin ?? "*";
    n.postMessage(t, o), console.debug(
      `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Posted message:`,
      {
        type: e.type,
        event: e.event || "N/A",
        id: e.id || "N/A",
        context: s,
        targetWindow: n === window ? "self" : "other"
      }
    );
  }
  async handleMessage(e) {
    if (!e.data?.type?.startsWith?.("rpc-")) return;
    const t = e.data;
    if (console.debug(
      `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Received message:`,
      {
        type: t.type,
        event: t.event || "N/A",
        id: t.id || "N/A",
        senderInstanceId: t.senderInstanceId,
        senderIsHost: t.senderIsHost,
        myInstanceId: this.instanceId,
        myIsHost: this.options.isHost
      }
    ), t.senderInstanceId === this.instanceId) {
      console.debug(
        `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Ignoring message from self (instance: ${this.instanceId})`
      );
      return;
    }
    switch (this.options.isHost && !this.isConnected && t.senderIsHost === !1 && (console.debug(
      "[RPC-HOST] First client message received, setting host as connected"
    ), this.notifyConnectionChange(!0)), t.type) {
      case "rpc-connect":
        await this.handleConnect(t);
        break;
      case "rpc-call":
        await this.handleRemoteCall(t);
        break;
      case "rpc-response":
        this.handleRemoteResponse(t);
        break;
      case "rpc-register-handlers":
        this.handleHandlerRegistration(t);
        break;
    }
  }
  async handleConnect(e) {
    this.options.isHost && (console.debug(
      `[RPC-HOST] Processing connect message - currently connected: ${this.isConnected}`
    ), this.isConnected || (console.debug(
      "[RPC-HOST] Setting host as connected due to client connect message"
    ), this.notifyConnectionChange(!0)), this.postMessage({
      type: "rpc-connect",
      connected: !0
    }));
  }
  async handleRemoteCall(e) {
    const { id: t, event: n, data: s } = e;
    if (!(!t || !n)) {
      console.debug(
        `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Processing remote call:`,
        {
          event: n,
          id: t,
          data: s,
          availableHandlers: Array.from(this.handlers.keys())
        }
      );
      try {
        const o = this.handlers.get(n);
        if (!o) {
          const d = `No handler registered for event: ${n}`;
          throw console.debug(
            `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Handler not found:`,
            {
              event: n,
              availableHandlers: Array.from(this.handlers.keys())
            }
          ), new Error(d);
        }
        console.debug(
          `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Executing handler for: ${n}`
        );
        const r = await o({ type: n, data: s }), c = {
          type: "rpc-response",
          id: t,
          result: r
        };
        this.postMessage(c), console.debug(
          `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Handled remote call: ${n}`,
          { id: t, result: r }
        );
      } catch (o) {
        const i = {
          type: "rpc-response",
          id: t,
          error: o instanceof Error ? o.message : String(o)
        };
        this.postMessage(i), console.debug(
          `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Error handling remote call: ${n}`,
          { id: t, error: o }
        );
      }
    }
  }
  handleRemoteResponse(e) {
    const { id: t, result: n, error: s } = e;
    if (!t) return;
    const o = this.pendingCalls.get(t);
    if (!o) return;
    o.timeout && clearTimeout(o.timeout), this.pendingCalls.delete(t);
    const i = o.defaultValue;
    if (s)
      if (i !== void 0 && typeof s == "string" && s.startsWith("No handler registered for event:"))
        o.resolve(i);
      else {
        const r = new l(
          s.startsWith("No handler registered for event:") ? "NoHandler" : "HandlerError",
          s
        );
        this.onError ? this.onError(
          r,
          { event: "unknown", data: void 0, defaultValue: i },
          o.resolve,
          o.reject
        ) : o.reject(r);
      }
    else
      o.resolve(n);
    console.debug(
      `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Received response for call: ${t}`,
      { result: n, error: s }
    );
  }
  handleHandlerRegistration(e) {
    const { handlers: t } = e;
    t && console.debug(
      `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Remote registered handlers:`,
      t
    );
  }
  async waitForConnection() {
    if (!this.isConnected)
      return this._waitForConnection || (this._waitForConnection = new Promise((e) => {
        this.onConnectionChange((t) => {
          t && (this._waitForConnection = void 0, e());
        });
      })), this._waitForConnection;
  }
  startListening() {
    this.messageHandler || (this.messageHandler = this.handleMessage, window.addEventListener("message", this.messageHandler), console.debug(
      `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Started listening for RPC messages`
    ));
  }
  stopListening() {
    this.messageHandler && (window.removeEventListener("message", this.messageHandler), this.messageHandler = null, this.pendingCalls.forEach(({ reject: e, timeout: t }) => {
      t && clearTimeout(t);
      try {
        e(new Error("RPC manager stopped"));
      } catch {
      }
    }), this.pendingCalls.clear(), this.notifyConnectionChange(!1), console.debug(
      `[RPC${this.options.isHost ? "-HOST" : "-CLIENT"}] Stopped listening for RPC messages`
    ));
  }
  getConnectionStatus() {
    return this.isConnected;
  }
  getRegisteredHandlers() {
    return Array.from(this.handlers.keys());
  }
  getInstanceId() {
    return this.instanceId;
  }
}
Object.assign(window, { RPCManager: f });
export {
  l as RPCError,
  m as RPCErrorType,
  f as RPCManager
};
//# sourceMappingURL=rpc-manager.es.js.map
