# Overview

## Runtime Bridge

### Requirements

* Couchbase 7+
* Redis 5+
* NodeJS 14(Latest LTS)
* Local Phala Full-Node

### Recommended Hardware for Controller

* 64G RAM
* E5-(? to test)

### Fetcher

* `prb fetch` reorganizes blocks into formats that pRuntime consumes.
* requires at least 10Mbps bandwidth for intranet I/O when synching blocks from the chain

### Lifecycle Manager

* `prb lifecycles` manages workers’ lifecycle:
* provides a simple RPC to be used in a trusted environment:
  * create/update/delete worker accounts:
  * broadcast/query worker’ state
  * kick worker
* All RPC messages are stateless and can be handled easily to integrate.
* The Couchbase db can be used directly on read-only usages.

### Relay Trader

* `prb trade` plays with Phala transactions from queue. It’s designed to be stateless and can work as a cluster.

## Deployment

### Prepare workers

There is only `pRuntime` to run on the worker machine. Following Docker Compose YAML contains a sample:

<https://github.com/Phala-Network/runtime-bridge/blob/master/docker/testing/worker/docker-compose.yaml>


Once workers are prepared, add the worker to the DB(e.g .<https://github.com/Phala-Network/runtime-bridge/blob/master/src/scripts/add_machine.js>).


Once the worker is added, an account is created automatically and can be accessed from the DB(as

`phalaSs58Address` in the sample script above). You might need to transfer enough PHA to them referring <https://polkadot.js.org/docs/api/examples/promise/transfer-events>.


### Docker Compose Quick Start

Use the sample `docker-compose.yml `from <https://github.com/Phala-Network/runtime-bridge/blob/master/docker/testing/bridge/docker-compose.yml>.


A Phala full node is not included in the setup, you need to deploy it in another place.


1. Run `docker-compose up -d couchbase` to start the DB, open `http://controller-ip:18091` in browser to setup initial credentials, then create a bucket named `phala`.
2. Edit the YAML file to fit the credentials and Phala node endpoint.
   * search `-c` for Couchbase credentials like `couchbase://couchbase/phala:user@password;`
   * search `-p` for Phala node endpoint.
3. Run `docker-compose up -d redis` to start Redis.
4. Run `docker-compose up -d fetch` to start the block fetcher.
5. When the fetcher reached the network height, run `docker-compose up -f trade` to start the trader.
6. Finally run `docker-compose up -d lifecycle` to start the lifecycle manager, all saved worker should start automatically, to check states, use Couchbase UI to make queries or build your own UI using Redis RPC.
