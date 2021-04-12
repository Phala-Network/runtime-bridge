runtime-bridge
------
## Quick Deployment

1. Apply sysctl configuration as in `system` folder.

2. cd into `docker/tesing/bridge` and run `docker-compose build`.

3. `docker-compose up -d couchbase redis` to start db, go to `http://host-ip:18091` to configure corresponding credentials and bucket(phala@phala:phalaphala).

4. `docker-compose up -d fetch`.

5. When finished synching, run `docker-compose up -d` to start the whole service.