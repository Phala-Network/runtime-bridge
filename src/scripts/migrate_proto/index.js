/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const migrator = $root.migrator = (() => {

    /**
     * Namespace migrator.
     * @exports migrator
     * @namespace
     */
    const migrator = {};

    migrator.FullAccount = (function() {

        /**
         * Properties of a FullAccount.
         * @memberof migrator
         * @interface IFullAccount
         * @property {string|null} [mnemonic] FullAccount mnemonic
         * @property {string|null} [polkadotJson] FullAccount polkadotJson
         * @property {string|null} [ss58Phala] FullAccount ss58Phala
         * @property {string|null} [ss58Polkadot] FullAccount ss58Polkadot
         */

        /**
         * Constructs a new FullAccount.
         * @memberof migrator
         * @classdesc Represents a FullAccount.
         * @implements IFullAccount
         * @constructor
         * @param {migrator.IFullAccount=} [p] Properties to set
         */
        function FullAccount(p) {
            if (p)
                for (var ks = Object.keys(p), i = 0; i < ks.length; ++i)
                    if (p[ks[i]] != null)
                        this[ks[i]] = p[ks[i]];
        }

        /**
         * FullAccount mnemonic.
         * @member {string} mnemonic
         * @memberof migrator.FullAccount
         * @instance
         */
        FullAccount.prototype.mnemonic = "";

        /**
         * FullAccount polkadotJson.
         * @member {string} polkadotJson
         * @memberof migrator.FullAccount
         * @instance
         */
        FullAccount.prototype.polkadotJson = "";

        /**
         * FullAccount ss58Phala.
         * @member {string} ss58Phala
         * @memberof migrator.FullAccount
         * @instance
         */
        FullAccount.prototype.ss58Phala = "";

        /**
         * FullAccount ss58Polkadot.
         * @member {string} ss58Polkadot
         * @memberof migrator.FullAccount
         * @instance
         */
        FullAccount.prototype.ss58Polkadot = "";

        /**
         * Creates a new FullAccount instance using the specified properties.
         * @function create
         * @memberof migrator.FullAccount
         * @static
         * @param {migrator.IFullAccount=} [properties] Properties to set
         * @returns {migrator.FullAccount} FullAccount instance
         */
        FullAccount.create = function create(properties) {
            return new FullAccount(properties);
        };

        /**
         * Encodes the specified FullAccount message. Does not implicitly {@link migrator.FullAccount.verify|verify} messages.
         * @function encode
         * @memberof migrator.FullAccount
         * @static
         * @param {migrator.IFullAccount} m FullAccount message or plain object to encode
         * @param {$protobuf.Writer} [w] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FullAccount.encode = function encode(m, w) {
            if (!w)
                w = $Writer.create();
            if (m.mnemonic != null && Object.hasOwnProperty.call(m, "mnemonic"))
                w.uint32(10).string(m.mnemonic);
            if (m.polkadotJson != null && Object.hasOwnProperty.call(m, "polkadotJson"))
                w.uint32(18).string(m.polkadotJson);
            if (m.ss58Phala != null && Object.hasOwnProperty.call(m, "ss58Phala"))
                w.uint32(26).string(m.ss58Phala);
            if (m.ss58Polkadot != null && Object.hasOwnProperty.call(m, "ss58Polkadot"))
                w.uint32(34).string(m.ss58Polkadot);
            return w;
        };

        /**
         * Encodes the specified FullAccount message, length delimited. Does not implicitly {@link migrator.FullAccount.verify|verify} messages.
         * @function encodeDelimited
         * @memberof migrator.FullAccount
         * @static
         * @param {migrator.IFullAccount} message FullAccount message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FullAccount.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a FullAccount message from the specified reader or buffer.
         * @function decode
         * @memberof migrator.FullAccount
         * @static
         * @param {$protobuf.Reader|Uint8Array} r Reader or buffer to decode from
         * @param {number} [l] Message length if known beforehand
         * @returns {migrator.FullAccount} FullAccount
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FullAccount.decode = function decode(r, l) {
            if (!(r instanceof $Reader))
                r = $Reader.create(r);
            var c = l === undefined ? r.len : r.pos + l, m = new $root.migrator.FullAccount();
            while (r.pos < c) {
                var t = r.uint32();
                switch (t >>> 3) {
                case 1:
                    m.mnemonic = r.string();
                    break;
                case 2:
                    m.polkadotJson = r.string();
                    break;
                case 3:
                    m.ss58Phala = r.string();
                    break;
                case 4:
                    m.ss58Polkadot = r.string();
                    break;
                default:
                    r.skipType(t & 7);
                    break;
                }
            }
            return m;
        };

        /**
         * Decodes a FullAccount message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof migrator.FullAccount
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {migrator.FullAccount} FullAccount
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FullAccount.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a FullAccount message.
         * @function verify
         * @memberof migrator.FullAccount
         * @static
         * @param {Object.<string,*>} m Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        FullAccount.verify = function verify(m) {
            if (typeof m !== "object" || m === null)
                return "object expected";
            if (m.mnemonic != null && m.hasOwnProperty("mnemonic")) {
                if (!$util.isString(m.mnemonic))
                    return "mnemonic: string expected";
            }
            if (m.polkadotJson != null && m.hasOwnProperty("polkadotJson")) {
                if (!$util.isString(m.polkadotJson))
                    return "polkadotJson: string expected";
            }
            if (m.ss58Phala != null && m.hasOwnProperty("ss58Phala")) {
                if (!$util.isString(m.ss58Phala))
                    return "ss58Phala: string expected";
            }
            if (m.ss58Polkadot != null && m.hasOwnProperty("ss58Polkadot")) {
                if (!$util.isString(m.ss58Polkadot))
                    return "ss58Polkadot: string expected";
            }
            return null;
        };

        /**
         * Creates a FullAccount message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof migrator.FullAccount
         * @static
         * @param {Object.<string,*>} d Plain object
         * @returns {migrator.FullAccount} FullAccount
         */
        FullAccount.fromObject = function fromObject(d) {
            if (d instanceof $root.migrator.FullAccount)
                return d;
            var m = new $root.migrator.FullAccount();
            if (d.mnemonic != null) {
                m.mnemonic = String(d.mnemonic);
            }
            if (d.polkadotJson != null) {
                m.polkadotJson = String(d.polkadotJson);
            }
            if (d.ss58Phala != null) {
                m.ss58Phala = String(d.ss58Phala);
            }
            if (d.ss58Polkadot != null) {
                m.ss58Polkadot = String(d.ss58Polkadot);
            }
            return m;
        };

        /**
         * Creates a plain object from a FullAccount message. Also converts values to other types if specified.
         * @function toObject
         * @memberof migrator.FullAccount
         * @static
         * @param {migrator.FullAccount} m FullAccount
         * @param {$protobuf.IConversionOptions} [o] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        FullAccount.toObject = function toObject(m, o) {
            if (!o)
                o = {};
            var d = {};
            if (o.defaults) {
                d.mnemonic = "";
                d.polkadotJson = "";
                d.ss58Phala = "";
                d.ss58Polkadot = "";
            }
            if (m.mnemonic != null && m.hasOwnProperty("mnemonic")) {
                d.mnemonic = m.mnemonic;
            }
            if (m.polkadotJson != null && m.hasOwnProperty("polkadotJson")) {
                d.polkadotJson = m.polkadotJson;
            }
            if (m.ss58Phala != null && m.hasOwnProperty("ss58Phala")) {
                d.ss58Phala = m.ss58Phala;
            }
            if (m.ss58Polkadot != null && m.hasOwnProperty("ss58Polkadot")) {
                d.ss58Polkadot = m.ss58Polkadot;
            }
            return d;
        };

        /**
         * Converts this FullAccount to JSON.
         * @function toJSON
         * @memberof migrator.FullAccount
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        FullAccount.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        return FullAccount;
    })();

    migrator.Pool = (function() {

        /**
         * Properties of a Pool.
         * @memberof migrator
         * @interface IPool
         * @property {string|null} [uuid] Pool uuid
         * @property {migrator.IFullAccount|null} [owner] Pool owner
         * @property {number|Long|null} [pid] Pool pid
         * @property {string|null} [name] Pool name
         * @property {boolean|null} [enabled] Pool enabled
         * @property {boolean|null} [deleted] Pool deleted
         * @property {string|null} [realPhalaSs58] Pool realPhalaSs58
         */

        /**
         * Constructs a new Pool.
         * @memberof migrator
         * @classdesc Represents a Pool.
         * @implements IPool
         * @constructor
         * @param {migrator.IPool=} [p] Properties to set
         */
        function Pool(p) {
            if (p)
                for (var ks = Object.keys(p), i = 0; i < ks.length; ++i)
                    if (p[ks[i]] != null)
                        this[ks[i]] = p[ks[i]];
        }

        /**
         * Pool uuid.
         * @member {string} uuid
         * @memberof migrator.Pool
         * @instance
         */
        Pool.prototype.uuid = "";

        /**
         * Pool owner.
         * @member {migrator.IFullAccount|null|undefined} owner
         * @memberof migrator.Pool
         * @instance
         */
        Pool.prototype.owner = null;

        /**
         * Pool pid.
         * @member {number|Long} pid
         * @memberof migrator.Pool
         * @instance
         */
        Pool.prototype.pid = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Pool name.
         * @member {string} name
         * @memberof migrator.Pool
         * @instance
         */
        Pool.prototype.name = "";

        /**
         * Pool enabled.
         * @member {boolean} enabled
         * @memberof migrator.Pool
         * @instance
         */
        Pool.prototype.enabled = false;

        /**
         * Pool deleted.
         * @member {boolean} deleted
         * @memberof migrator.Pool
         * @instance
         */
        Pool.prototype.deleted = false;

        /**
         * Pool realPhalaSs58.
         * @member {string} realPhalaSs58
         * @memberof migrator.Pool
         * @instance
         */
        Pool.prototype.realPhalaSs58 = "";

        /**
         * Creates a new Pool instance using the specified properties.
         * @function create
         * @memberof migrator.Pool
         * @static
         * @param {migrator.IPool=} [properties] Properties to set
         * @returns {migrator.Pool} Pool instance
         */
        Pool.create = function create(properties) {
            return new Pool(properties);
        };

        /**
         * Encodes the specified Pool message. Does not implicitly {@link migrator.Pool.verify|verify} messages.
         * @function encode
         * @memberof migrator.Pool
         * @static
         * @param {migrator.IPool} m Pool message or plain object to encode
         * @param {$protobuf.Writer} [w] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Pool.encode = function encode(m, w) {
            if (!w)
                w = $Writer.create();
            if (m.uuid != null && Object.hasOwnProperty.call(m, "uuid"))
                w.uint32(10).string(m.uuid);
            if (m.owner != null && Object.hasOwnProperty.call(m, "owner"))
                $root.migrator.FullAccount.encode(m.owner, w.uint32(18).fork()).ldelim();
            if (m.pid != null && Object.hasOwnProperty.call(m, "pid"))
                w.uint32(24).uint64(m.pid);
            if (m.name != null && Object.hasOwnProperty.call(m, "name"))
                w.uint32(34).string(m.name);
            if (m.enabled != null && Object.hasOwnProperty.call(m, "enabled"))
                w.uint32(40).bool(m.enabled);
            if (m.deleted != null && Object.hasOwnProperty.call(m, "deleted"))
                w.uint32(48).bool(m.deleted);
            if (m.realPhalaSs58 != null && Object.hasOwnProperty.call(m, "realPhalaSs58"))
                w.uint32(58).string(m.realPhalaSs58);
            return w;
        };

        /**
         * Encodes the specified Pool message, length delimited. Does not implicitly {@link migrator.Pool.verify|verify} messages.
         * @function encodeDelimited
         * @memberof migrator.Pool
         * @static
         * @param {migrator.IPool} message Pool message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Pool.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Pool message from the specified reader or buffer.
         * @function decode
         * @memberof migrator.Pool
         * @static
         * @param {$protobuf.Reader|Uint8Array} r Reader or buffer to decode from
         * @param {number} [l] Message length if known beforehand
         * @returns {migrator.Pool} Pool
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Pool.decode = function decode(r, l) {
            if (!(r instanceof $Reader))
                r = $Reader.create(r);
            var c = l === undefined ? r.len : r.pos + l, m = new $root.migrator.Pool();
            while (r.pos < c) {
                var t = r.uint32();
                switch (t >>> 3) {
                case 1:
                    m.uuid = r.string();
                    break;
                case 2:
                    m.owner = $root.migrator.FullAccount.decode(r, r.uint32());
                    break;
                case 3:
                    m.pid = r.uint64();
                    break;
                case 4:
                    m.name = r.string();
                    break;
                case 5:
                    m.enabled = r.bool();
                    break;
                case 6:
                    m.deleted = r.bool();
                    break;
                case 7:
                    m.realPhalaSs58 = r.string();
                    break;
                default:
                    r.skipType(t & 7);
                    break;
                }
            }
            return m;
        };

        /**
         * Decodes a Pool message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof migrator.Pool
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {migrator.Pool} Pool
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Pool.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Pool message.
         * @function verify
         * @memberof migrator.Pool
         * @static
         * @param {Object.<string,*>} m Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Pool.verify = function verify(m) {
            if (typeof m !== "object" || m === null)
                return "object expected";
            if (m.uuid != null && m.hasOwnProperty("uuid")) {
                if (!$util.isString(m.uuid))
                    return "uuid: string expected";
            }
            if (m.owner != null && m.hasOwnProperty("owner")) {
                {
                    var e = $root.migrator.FullAccount.verify(m.owner);
                    if (e)
                        return "owner." + e;
                }
            }
            if (m.pid != null && m.hasOwnProperty("pid")) {
                if (!$util.isInteger(m.pid) && !(m.pid && $util.isInteger(m.pid.low) && $util.isInteger(m.pid.high)))
                    return "pid: integer|Long expected";
            }
            if (m.name != null && m.hasOwnProperty("name")) {
                if (!$util.isString(m.name))
                    return "name: string expected";
            }
            if (m.enabled != null && m.hasOwnProperty("enabled")) {
                if (typeof m.enabled !== "boolean")
                    return "enabled: boolean expected";
            }
            if (m.deleted != null && m.hasOwnProperty("deleted")) {
                if (typeof m.deleted !== "boolean")
                    return "deleted: boolean expected";
            }
            if (m.realPhalaSs58 != null && m.hasOwnProperty("realPhalaSs58")) {
                if (!$util.isString(m.realPhalaSs58))
                    return "realPhalaSs58: string expected";
            }
            return null;
        };

        /**
         * Creates a Pool message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof migrator.Pool
         * @static
         * @param {Object.<string,*>} d Plain object
         * @returns {migrator.Pool} Pool
         */
        Pool.fromObject = function fromObject(d) {
            if (d instanceof $root.migrator.Pool)
                return d;
            var m = new $root.migrator.Pool();
            if (d.uuid != null) {
                m.uuid = String(d.uuid);
            }
            if (d.owner != null) {
                if (typeof d.owner !== "object")
                    throw TypeError(".migrator.Pool.owner: object expected");
                m.owner = $root.migrator.FullAccount.fromObject(d.owner);
            }
            if (d.pid != null) {
                if ($util.Long)
                    (m.pid = $util.Long.fromValue(d.pid)).unsigned = true;
                else if (typeof d.pid === "string")
                    m.pid = parseInt(d.pid, 10);
                else if (typeof d.pid === "number")
                    m.pid = d.pid;
                else if (typeof d.pid === "object")
                    m.pid = new $util.LongBits(d.pid.low >>> 0, d.pid.high >>> 0).toNumber(true);
            }
            if (d.name != null) {
                m.name = String(d.name);
            }
            if (d.enabled != null) {
                m.enabled = Boolean(d.enabled);
            }
            if (d.deleted != null) {
                m.deleted = Boolean(d.deleted);
            }
            if (d.realPhalaSs58 != null) {
                m.realPhalaSs58 = String(d.realPhalaSs58);
            }
            return m;
        };

        /**
         * Creates a plain object from a Pool message. Also converts values to other types if specified.
         * @function toObject
         * @memberof migrator.Pool
         * @static
         * @param {migrator.Pool} m Pool
         * @param {$protobuf.IConversionOptions} [o] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Pool.toObject = function toObject(m, o) {
            if (!o)
                o = {};
            var d = {};
            if (o.defaults) {
                d.uuid = "";
                d.owner = null;
                if ($util.Long) {
                    var n = new $util.Long(0, 0, true);
                    d.pid = o.longs === String ? n.toString() : o.longs === Number ? n.toNumber() : n;
                } else
                    d.pid = o.longs === String ? "0" : 0;
                d.name = "";
                d.enabled = false;
                d.deleted = false;
                d.realPhalaSs58 = "";
            }
            if (m.uuid != null && m.hasOwnProperty("uuid")) {
                d.uuid = m.uuid;
            }
            if (m.owner != null && m.hasOwnProperty("owner")) {
                d.owner = $root.migrator.FullAccount.toObject(m.owner, o);
            }
            if (m.pid != null && m.hasOwnProperty("pid")) {
                if (typeof m.pid === "number")
                    d.pid = o.longs === String ? String(m.pid) : m.pid;
                else
                    d.pid = o.longs === String ? $util.Long.prototype.toString.call(m.pid) : o.longs === Number ? new $util.LongBits(m.pid.low >>> 0, m.pid.high >>> 0).toNumber(true) : m.pid;
            }
            if (m.name != null && m.hasOwnProperty("name")) {
                d.name = m.name;
            }
            if (m.enabled != null && m.hasOwnProperty("enabled")) {
                d.enabled = m.enabled;
            }
            if (m.deleted != null && m.hasOwnProperty("deleted")) {
                d.deleted = m.deleted;
            }
            if (m.realPhalaSs58 != null && m.hasOwnProperty("realPhalaSs58")) {
                d.realPhalaSs58 = m.realPhalaSs58;
            }
            return d;
        };

        /**
         * Converts this Pool to JSON.
         * @function toJSON
         * @memberof migrator.Pool
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Pool.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        return Pool;
    })();

    migrator.Worker = (function() {

        /**
         * Properties of a Worker.
         * @memberof migrator
         * @interface IWorker
         * @property {string|null} [uuid] Worker uuid
         * @property {number|Long|null} [pid] Worker pid
         * @property {string|null} [name] Worker name
         * @property {string|null} [endpoint] Worker endpoint
         * @property {boolean|null} [enabled] Worker enabled
         * @property {boolean|null} [deleted] Worker deleted
         * @property {string|null} [stake] Worker stake
         */

        /**
         * Constructs a new Worker.
         * @memberof migrator
         * @classdesc Represents a Worker.
         * @implements IWorker
         * @constructor
         * @param {migrator.IWorker=} [p] Properties to set
         */
        function Worker(p) {
            if (p)
                for (var ks = Object.keys(p), i = 0; i < ks.length; ++i)
                    if (p[ks[i]] != null)
                        this[ks[i]] = p[ks[i]];
        }

        /**
         * Worker uuid.
         * @member {string} uuid
         * @memberof migrator.Worker
         * @instance
         */
        Worker.prototype.uuid = "";

        /**
         * Worker pid.
         * @member {number|Long} pid
         * @memberof migrator.Worker
         * @instance
         */
        Worker.prototype.pid = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Worker name.
         * @member {string} name
         * @memberof migrator.Worker
         * @instance
         */
        Worker.prototype.name = "";

        /**
         * Worker endpoint.
         * @member {string} endpoint
         * @memberof migrator.Worker
         * @instance
         */
        Worker.prototype.endpoint = "";

        /**
         * Worker enabled.
         * @member {boolean} enabled
         * @memberof migrator.Worker
         * @instance
         */
        Worker.prototype.enabled = false;

        /**
         * Worker deleted.
         * @member {boolean} deleted
         * @memberof migrator.Worker
         * @instance
         */
        Worker.prototype.deleted = false;

        /**
         * Worker stake.
         * @member {string} stake
         * @memberof migrator.Worker
         * @instance
         */
        Worker.prototype.stake = "";

        /**
         * Creates a new Worker instance using the specified properties.
         * @function create
         * @memberof migrator.Worker
         * @static
         * @param {migrator.IWorker=} [properties] Properties to set
         * @returns {migrator.Worker} Worker instance
         */
        Worker.create = function create(properties) {
            return new Worker(properties);
        };

        /**
         * Encodes the specified Worker message. Does not implicitly {@link migrator.Worker.verify|verify} messages.
         * @function encode
         * @memberof migrator.Worker
         * @static
         * @param {migrator.IWorker} m Worker message or plain object to encode
         * @param {$protobuf.Writer} [w] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Worker.encode = function encode(m, w) {
            if (!w)
                w = $Writer.create();
            if (m.uuid != null && Object.hasOwnProperty.call(m, "uuid"))
                w.uint32(10).string(m.uuid);
            if (m.pid != null && Object.hasOwnProperty.call(m, "pid"))
                w.uint32(16).uint64(m.pid);
            if (m.name != null && Object.hasOwnProperty.call(m, "name"))
                w.uint32(26).string(m.name);
            if (m.endpoint != null && Object.hasOwnProperty.call(m, "endpoint"))
                w.uint32(34).string(m.endpoint);
            if (m.enabled != null && Object.hasOwnProperty.call(m, "enabled"))
                w.uint32(40).bool(m.enabled);
            if (m.deleted != null && Object.hasOwnProperty.call(m, "deleted"))
                w.uint32(48).bool(m.deleted);
            if (m.stake != null && Object.hasOwnProperty.call(m, "stake"))
                w.uint32(58).string(m.stake);
            return w;
        };

        /**
         * Encodes the specified Worker message, length delimited. Does not implicitly {@link migrator.Worker.verify|verify} messages.
         * @function encodeDelimited
         * @memberof migrator.Worker
         * @static
         * @param {migrator.IWorker} message Worker message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Worker.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Worker message from the specified reader or buffer.
         * @function decode
         * @memberof migrator.Worker
         * @static
         * @param {$protobuf.Reader|Uint8Array} r Reader or buffer to decode from
         * @param {number} [l] Message length if known beforehand
         * @returns {migrator.Worker} Worker
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Worker.decode = function decode(r, l) {
            if (!(r instanceof $Reader))
                r = $Reader.create(r);
            var c = l === undefined ? r.len : r.pos + l, m = new $root.migrator.Worker();
            while (r.pos < c) {
                var t = r.uint32();
                switch (t >>> 3) {
                case 1:
                    m.uuid = r.string();
                    break;
                case 2:
                    m.pid = r.uint64();
                    break;
                case 3:
                    m.name = r.string();
                    break;
                case 4:
                    m.endpoint = r.string();
                    break;
                case 5:
                    m.enabled = r.bool();
                    break;
                case 6:
                    m.deleted = r.bool();
                    break;
                case 7:
                    m.stake = r.string();
                    break;
                default:
                    r.skipType(t & 7);
                    break;
                }
            }
            return m;
        };

        /**
         * Decodes a Worker message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof migrator.Worker
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {migrator.Worker} Worker
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Worker.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Worker message.
         * @function verify
         * @memberof migrator.Worker
         * @static
         * @param {Object.<string,*>} m Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Worker.verify = function verify(m) {
            if (typeof m !== "object" || m === null)
                return "object expected";
            if (m.uuid != null && m.hasOwnProperty("uuid")) {
                if (!$util.isString(m.uuid))
                    return "uuid: string expected";
            }
            if (m.pid != null && m.hasOwnProperty("pid")) {
                if (!$util.isInteger(m.pid) && !(m.pid && $util.isInteger(m.pid.low) && $util.isInteger(m.pid.high)))
                    return "pid: integer|Long expected";
            }
            if (m.name != null && m.hasOwnProperty("name")) {
                if (!$util.isString(m.name))
                    return "name: string expected";
            }
            if (m.endpoint != null && m.hasOwnProperty("endpoint")) {
                if (!$util.isString(m.endpoint))
                    return "endpoint: string expected";
            }
            if (m.enabled != null && m.hasOwnProperty("enabled")) {
                if (typeof m.enabled !== "boolean")
                    return "enabled: boolean expected";
            }
            if (m.deleted != null && m.hasOwnProperty("deleted")) {
                if (typeof m.deleted !== "boolean")
                    return "deleted: boolean expected";
            }
            if (m.stake != null && m.hasOwnProperty("stake")) {
                if (!$util.isString(m.stake))
                    return "stake: string expected";
            }
            return null;
        };

        /**
         * Creates a Worker message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof migrator.Worker
         * @static
         * @param {Object.<string,*>} d Plain object
         * @returns {migrator.Worker} Worker
         */
        Worker.fromObject = function fromObject(d) {
            if (d instanceof $root.migrator.Worker)
                return d;
            var m = new $root.migrator.Worker();
            if (d.uuid != null) {
                m.uuid = String(d.uuid);
            }
            if (d.pid != null) {
                if ($util.Long)
                    (m.pid = $util.Long.fromValue(d.pid)).unsigned = true;
                else if (typeof d.pid === "string")
                    m.pid = parseInt(d.pid, 10);
                else if (typeof d.pid === "number")
                    m.pid = d.pid;
                else if (typeof d.pid === "object")
                    m.pid = new $util.LongBits(d.pid.low >>> 0, d.pid.high >>> 0).toNumber(true);
            }
            if (d.name != null) {
                m.name = String(d.name);
            }
            if (d.endpoint != null) {
                m.endpoint = String(d.endpoint);
            }
            if (d.enabled != null) {
                m.enabled = Boolean(d.enabled);
            }
            if (d.deleted != null) {
                m.deleted = Boolean(d.deleted);
            }
            if (d.stake != null) {
                m.stake = String(d.stake);
            }
            return m;
        };

        /**
         * Creates a plain object from a Worker message. Also converts values to other types if specified.
         * @function toObject
         * @memberof migrator.Worker
         * @static
         * @param {migrator.Worker} m Worker
         * @param {$protobuf.IConversionOptions} [o] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Worker.toObject = function toObject(m, o) {
            if (!o)
                o = {};
            var d = {};
            if (o.defaults) {
                d.uuid = "";
                if ($util.Long) {
                    var n = new $util.Long(0, 0, true);
                    d.pid = o.longs === String ? n.toString() : o.longs === Number ? n.toNumber() : n;
                } else
                    d.pid = o.longs === String ? "0" : 0;
                d.name = "";
                d.endpoint = "";
                d.enabled = false;
                d.deleted = false;
                d.stake = "";
            }
            if (m.uuid != null && m.hasOwnProperty("uuid")) {
                d.uuid = m.uuid;
            }
            if (m.pid != null && m.hasOwnProperty("pid")) {
                if (typeof m.pid === "number")
                    d.pid = o.longs === String ? String(m.pid) : m.pid;
                else
                    d.pid = o.longs === String ? $util.Long.prototype.toString.call(m.pid) : o.longs === Number ? new $util.LongBits(m.pid.low >>> 0, m.pid.high >>> 0).toNumber(true) : m.pid;
            }
            if (m.name != null && m.hasOwnProperty("name")) {
                d.name = m.name;
            }
            if (m.endpoint != null && m.hasOwnProperty("endpoint")) {
                d.endpoint = m.endpoint;
            }
            if (m.enabled != null && m.hasOwnProperty("enabled")) {
                d.enabled = m.enabled;
            }
            if (m.deleted != null && m.hasOwnProperty("deleted")) {
                d.deleted = m.deleted;
            }
            if (m.stake != null && m.hasOwnProperty("stake")) {
                d.stake = m.stake;
            }
            return d;
        };

        /**
         * Converts this Worker to JSON.
         * @function toJSON
         * @memberof migrator.Worker
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Worker.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        return Worker;
    })();

    return migrator;
})();

export { $root as default };
