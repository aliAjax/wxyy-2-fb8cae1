"use strict";

function createIndexedDBMock() {
  const databases = new Map();

  function makeStringList(arr) {
    const list = [...(arr || [])];
    list.contains = function (item) { return list.indexOf(item) !== -1; };
    return list;
  }

  function createDB(name, version) {
    return {
      name,
      version,
      stores: new Map(),
      objectStoreNames: makeStringList([])
    };
  }

  function ensureStore(db, storeName, options) {
    if (!db.stores.has(storeName)) {
      db.stores.set(storeName, {
        data: new Map(),
        keyPath: options?.keyPath || null,
        autoIncrement: options?.autoIncrement || false,
        indexes: new Map()
      });
      if (!db.objectStoreNames.contains(storeName)) {
        db.objectStoreNames.push(storeName);
      }
    }
    return db.stores.get(storeName);
  }

  function ensureIndex(store, indexName, keyPath, options) {
    if (!store.indexes.has(indexName)) {
      store.indexes.set(indexName, {
        name: indexName,
        keyPath: keyPath,
        unique: options?.unique || false,
        multiEntry: options?.multiEntry || false
      });
    }
    return store.indexes.get(indexName);
  }

  function getKeyPathValue(obj, keyPath) {
    if (!keyPath) return null;
    if (Array.isArray(keyPath)) {
      return keyPath.map(kp => getNestedValue(obj, kp));
    }
    return getNestedValue(obj, keyPath);
  }

  function getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split(".");
    let current = obj;
    for (const p of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[p];
    }
    return current;
  }

  function makeRequest(result, error) {
    const req = {
      result: undefined,
      error: null,
      readyState: "pending",
      onsuccess: null,
      onerror: null,
      _triggers: []
    };
    process.nextTick(() => {
      if (error) {
        req.error = error;
        req.readyState = "done";
        if (req.onerror) req.onerror({ target: req });
        req._triggers.forEach(t => t.error && t.error(error));
      } else {
        req.result = result;
        req.readyState = "done";
        if (req.onsuccess) req.onsuccess({ target: req });
        req._triggers.forEach(t => t.success && t.success(result));
      }
    });
    return req;
  }

  function makeUpgradeDB(db, oldVersion, newVersion) {
    const upgradedDB = {
      ...db,
      objectStoreNames: makeStringList(db.objectStoreNames),
      createObjectStore(name, options) {
        ensureStore(db, name, options);
        this.objectStoreNames = makeStringList(db.stores.keys());
        return makeObjectStoreAPI(db, name);
      },
      deleteObjectStore(name) {
        db.stores.delete(name);
        this.objectStoreNames = makeStringList(db.stores.keys());
      },
      transaction: null
    };
    return upgradedDB;
  }

  function makeObjectStoreAPI(db, storeName) {
    const store = db.stores.get(storeName);
    if (!store) throw new Error(`Store not found: ${storeName}`);

    return {
      name: storeName,
      keyPath: store.keyPath,
      autoIncrement: store.autoIncrement,
      indexNames: makeStringList(store.indexes.keys()),
      createIndex(name, keyPath, options) {
        ensureIndex(store, name, keyPath, options);
        this.indexNames = makeStringList(store.indexes.keys());
        return { name, keyPath, unique: options?.unique || false };
      },
      deleteIndex(name) {
        store.indexes.delete(name);
        this.indexNames = makeStringList(store.indexes.keys());
      },
      index(indexName) {
        const idx = store.indexes.get(indexName);
        if (!idx) throw new Error(`Index not found: ${indexName}`);
        return {
          name: indexName,
          keyPath: idx.keyPath,
          unique: idx.unique,
          getAll(query) {
            let results = [...store.data.values()];
            if (query !== undefined) {
              results = results.filter(v => {
                const val = getKeyPathValue(v, idx.keyPath);
                if (Array.isArray(idx.keyPath)) {
                  return JSON.stringify(val) === JSON.stringify(query);
                }
                return val === query;
              });
            }
            return makeRequest(results);
          },
          get(query) {
            const match = [...store.data.values()].find(v => {
              const val = getKeyPathValue(v, idx.keyPath);
              if (Array.isArray(idx.keyPath)) {
                return JSON.stringify(val) === JSON.stringify(query);
              }
              return val === query;
            });
            return makeRequest(match || undefined);
          },
          openCursor(query) {
            let entries = [...store.data.entries()];
            if (query !== undefined) {
              entries = entries.filter(([k, v]) => {
                const val = getKeyPathValue(v, idx.keyPath);
                if (Array.isArray(idx.keyPath)) {
                  return JSON.stringify(val) === JSON.stringify(query);
                }
                return val === query;
              });
            }
            entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
            let cursorIdx = 0;

            const cursor = {
              key: null,
              value: null,
              continue() { cursorIdx++; advance(); },
              delete() {
                if (cursorIdx - 1 >= 0 && cursorIdx - 1 < entries.length) {
                  store.data.delete(entries[cursorIdx - 1][0]);
                }
              },
              update(val) {
                if (cursorIdx - 1 >= 0 && cursorIdx - 1 < entries.length) {
                  const k = entries[cursorIdx - 1][0];
                  store.data.set(k, val);
                }
              }
            };

            const advance = () => {
              if (cursorIdx < entries.length) {
                cursor.key = entries[cursorIdx][0];
                cursor.value = entries[cursorIdx][1];
                cursorIdx++;
                if (req.onsuccess) req.onsuccess({ target: req });
              } else {
                cursor.key = null;
                cursor.value = null;
                if (req.onsuccess) req.onsuccess({ target: req });
              }
            };

            const req = {
              result: undefined,
              readyState: "pending",
              onsuccess: null,
              onerror: null
            };
            process.nextTick(() => {
              advance();
            });
            req.__cursor = cursor;
            return new Proxy(req, {
              get(target, prop) {
                if (prop in target) return target[prop];
                if (prop in cursor) return typeof cursor[prop] === "function"
                  ? cursor[prop].bind(cursor)
                  : cursor[prop];
                return undefined;
              }
            });
          }
        };
      },
      put(value) {
        let key;
        if (store.keyPath) {
          key = getKeyPathValue(value, store.keyPath);
          if (!key && store.autoIncrement) {
            key = (store.data.size + 1);
            setNestedValue(value, store.keyPath, key);
          }
        } else {
          key = store.data.size + 1;
        }
        store.data.set(String(key), { ...value });
        return makeRequest(key);
      },
      add(value) {
        let key;
        if (store.keyPath) {
          key = getKeyPathValue(value, store.keyPath);
          if (store.data.has(String(key))) {
            return makeRequest(null, new Error("Key already exists"));
          }
        } else {
          key = store.data.size + 1;
        }
        store.data.set(String(key), { ...value });
        return makeRequest(key);
      },
      get(key) {
        return makeRequest(store.data.has(String(key))
          ? { ...store.data.get(String(key)) }
          : undefined);
      },
      getAll(query) {
        return makeRequest([...store.data.values()].map(v => ({ ...v })));
      },
      delete(key) {
        store.data.delete(String(key));
        return makeRequest(undefined);
      },
      clear() {
        store.data.clear();
        return makeRequest(undefined);
      },
      openCursor() {
        let entries = [...store.data.entries()];
        entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
        let cursorIdx = 0;

        const cursor = {
          key: null,
          value: null,
          continue() { cursorIdx++; advance(); },
          delete() {
            if (cursorIdx - 1 >= 0 && cursorIdx - 1 < entries.length) {
              store.data.delete(entries[cursorIdx - 1][0]);
            }
          },
          update(val) {
            if (cursorIdx - 1 >= 0 && cursorIdx - 1 < entries.length) {
              const k = entries[cursorIdx - 1][0];
              store.data.set(k, val);
            }
          }
        };

        const advance = () => {
          if (cursorIdx < entries.length) {
            cursor.key = entries[cursorIdx][0];
            cursor.value = entries[cursorIdx][1];
            cursorIdx++;
            if (req.onsuccess) req.onsuccess({ target: req });
          } else {
            cursor.key = null;
            cursor.value = null;
            if (req.onsuccess) req.onsuccess({ target: req });
          }
        };

        const req = {
          result: undefined,
          readyState: "pending",
          onsuccess: null,
          onerror: null
        };
        process.nextTick(() => advance());
        req.__cursor = cursor;
        return new Proxy(req, {
          get(target, prop) {
            if (prop in target) return target[prop];
            if (prop in cursor) return typeof cursor[prop] === "function"
              ? cursor[prop].bind(cursor)
              : cursor[prop];
            return undefined;
          }
        });
      },
      count() {
        return makeRequest(store.data.size);
      }
    };
  }

  function setNestedValue(obj, path, value) {
    if (!obj || !path) return;
    const parts = path.split(".");
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  function makeTransaction(db, storeNames, mode) {
    const stores = (Array.isArray(storeNames) ? storeNames : [storeNames])
      .reduce((acc, sn) => {
        acc[sn] = makeObjectStoreAPI(db, sn);
        return acc;
      }, {});

    const tx = {
      db,
      mode,
      objectStore(name) { return stores[name]; },
      oncomplete: null,
      onerror: null,
      onabort: null,
      error: null,
      abort() {
        if (this.onabort) this.onabort({ target: tx });
      }
    };
    process.nextTick(() => {
      if (tx.oncomplete) tx.oncomplete({ target: tx });
    });
    return tx;
  }

  const mock = {
    _databases: databases,
    _reset() {
      databases.clear();
    },
    _getDB(name) {
      return databases.get(name);
    },
    _dumpAll() {
      const result = {};
      for (const [name, db] of databases.entries()) {
        result[name] = {};
        for (const [storeName, store] of db.stores.entries()) {
          result[name][storeName] = [...store.data.values()];
        }
      }
      return result;
    },
    open(name, version = 1) {
      let db = databases.get(name);
      const oldVersion = db ? db.version : 0;
      let needsUpgrade = !db || db.version < version;

      if (!db) {
        db = createDB(name, version);
        databases.set(name, db);
      } else if (db.version < version) {
        db.version = version;
      }

      const openReq = {
        result: undefined,
        error: null,
        readyState: "pending",
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null
      };

      process.nextTick(() => {
        if (needsUpgrade) {
          const upgradeDB = makeUpgradeDB(db, oldVersion, version);
          const event = {
            target: { result: upgradeDB },
            oldVersion,
            newVersion: version
          };
          event.target.transaction = {
            objectStore(storeName) {
              return makeObjectStoreAPI(db, storeName);
            }
          };
          openReq.result = upgradeDB;
          if (openReq.onupgradeneeded) {
            openReq.onupgradeneeded(event);
            db.objectStoreNames = makeStringList(db.stores.keys());
          }
        }

        openReq.result = {
          name: db.name,
          version: db.version,
          objectStoreNames: db.objectStoreNames,
          transaction(storeNames, mode) {
            return makeTransaction(db, storeNames, mode);
          },
          close() {}
        };
        if (openReq.onsuccess) openReq.onsuccess({ target: openReq });
      });

      return openReq;
    },
    deleteDatabase(name) {
      databases.delete(name);
      const req = {
        result: undefined,
        readyState: "pending",
        onsuccess: null,
        onerror: null
      };
      process.nextTick(() => {
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    },
    cmp(a, b) {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }
  };

  return mock;
}

function setupBrowserGlobals() {
  const idbMock = createIndexedDBMock();

  global.window = global;
  global.document = {
    body: { appendChild: function () {} },
    getElementById: function () { return null; },
    createElement: function () { return {}; },
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  global.indexedDB = idbMock;
  global.IDBKeyRange = {
    only: (v) => v,
    lowerBound: (v) => ({ lower: v }),
    upperBound: (v) => ({ upper: v }),
    bound: (l, u) => ({ lower: l, upper: u })
  };

  if (!global.crypto) {
    global.crypto = {
      randomUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
    };
  }

  if (!global.FileReader) {
    global.FileReader = class MockFileReader {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.result = null;
      }
      readAsText(blob) {
        const text = typeof blob === "string" ? blob : (blob?.content || "");
        process.nextTick(() => {
          this.result = text;
          if (this.onload) this.onload({ target: this });
        });
      }
      readAsDataURL(blob) {
        const url = typeof blob === "string" ? blob : (blob?.dataUrl || "data:application/octet-stream;base64,");
        process.nextTick(() => {
          this.result = url;
          if (this.onload) this.onload({ target: this });
        });
      }
    };
  }

  if (!global.File) {
    global.File = class MockFile {
      constructor(content, name, opts) {
        this.content = Array.isArray(content) ? content.join("") : String(content || "");
        this.name = name || "unnamed";
        this.type = opts?.type || "application/octet-stream";
        this.size = this.content.length;
      }
    };
  }

  if (!global.Blob) {
    global.Blob = class MockBlob {
      constructor(parts, opts) {
        this.parts = parts || [];
        this.type = opts?.type || "";
        this.size = parts?.reduce((a, p) => a + String(p).length, 0) || 0;
      }
    };
  }

  if (!global.atob) {
    global.atob = (s) => Buffer.from(s, "base64").toString("binary");
  }
  if (!global.btoa) {
    global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
  }

  return idbMock;
}

module.exports = {
  createIndexedDBMock,
  setupBrowserGlobals
};
