# Overview

## Runtime Bridge

### Requirements

* Redis 5+
* NodeJS 14(Latest LTS)
* Local Phala Full-Node

### Recommended Hardware for Controller

* 64G RAM
* SSD with enough cache for small files I/O
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


To add workers on CLI before the lifecycle starts:
```
cat test_data.json | docker-compose run --no-deps --use-aliases --entrypoint "pnpm add_machines" lifecycle | bunyan
```

A JSON formatted message will be printed to STDOUT which contains generated account information.

Once the worker is added, an account is created automatically and can be accessed from the DB(as `phalaSs58Address` in the sample script above). You might need to transfer enough PHA to them referring <https://polkadot.js.org/docs/api/examples/promise/transfer-events>.

To dump existing workers:
```
docker-compose run --no-deps --use-aliases --entrypoint "pnpm dump_machines" lifecycle
```

To import a dump:
```
cat dump.json | docker-compose run --no-deps --use-aliases --entrypoint "pnpm import_machines" lifecycle | bunyan
```

The `bunyan` command should be install via npm/pnpm/yarn in the host environment if you are using docker.

### Docker Compose Quick Start

Use the sample `docker-compose.yml `from <https://github.com/Phala-Network/runtime-bridge/blob/master/docker/testing/bridge/docker-compose.yml>.


A Phala full node is not included in the setup, you need to deploy it in another place.

0. Apply sysctl configuration as in `system` folder on the machine running `liftcycle` and `fetch`.
1. Run `docker-compose run --no-deps --use-aliases --entrypoint "pnpm db_init" fetch` to initialize database.
2. Edit the YAML file to fit the credentials and Phala node endpoint.
   * search `-p` for Phala node endpoint.
3. Run `docker-compose up -d redis` to start Redis.
4. Run `docker-compose up -d fetch` to start the block fetcher.
5. When the fetcher reached the network height, run `docker-compose up -d trade` to start the trader.
6. Finally run `docker-compose up -d lifecycle` to start the lifecycle manager, all saved worker should start automatically, to check states, use `runtime-bridge-monitor` or build your own UI using Redis RPC.
