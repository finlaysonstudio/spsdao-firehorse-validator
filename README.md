# SPS DAO Validator - _Fire Horse Edition_

_Fire Horse Edition_ is a fork of the [SPS DAO Validator](https://github.com/TheSPSDAO/SPS-Validator) with improvements to automation and reporting not needed by the "reference implementation."

The [installation instructions](INSTALL.md) are the same.

<p align="center">
  <img src="https://d36mxiodymuqjm.cloudfront.net/card_art/Nightmare.png" alt="Nightmare" width="400" /><br>
<em>On the darkest nights in Mortis, the great Nightmare herd can be seen from a hundred miles away, lighting up the Death Splinter's hazy sky as they burn for evermore.</em>
</p>

## Motivations

1. Better support for automation
2. Better support for redundancy
3. Better logging and reporting
4. Independent validator clients increase ecosystem health

## Improvements

### Automation

_Fire Horse Edition_ can be deployed automatically through CI/CD pipelines or other orchestration techniques.

- `run.sh build local-snapshot` runs the build from a local snapshot without user interaction
- `run.sh snapshot-auto` creates full and slim snapshots without user interaction

In the reference implementation, both creating a snapshot and replaying a snapshot require an interactive shell meaning they cannot be automated.

### Leader/Follower Instances for Redundancy

_Fire Horse Edition_ can be deployed on multiple machines with a designated "leader" to validate and staggered "followers" that submit blocks only if the leader does not validate in `VALIDATE_BLOCK_DELAY` blocks.

- Leader nodes (`VALIDATE_BLOCK_DELAY=0`) submit validations immediately
- Follower nodes (`VALIDATE_BLOCK_DELAY=12`) defer submission as backup
- Follower nodes can be used for automating snapshots

<p align="center">
  <br>
  <img src="./docs/already-validated-error.png" alt="The specified block has already been validated" width="350" /><br>
  <em>In-game error when a second validator tries to re-validate a block</em>
</p>

### Logging

_Fire Horse Edition_ includes an event logging plugin outputting JSON that can be ingested by an observability layer such as Datadog.

```json
{
  block: 104467089
  operation: validation
  account: nullfame
  validated_block: 104467084
  delta: 5
}
{
  block: 104449822
  operation: vote-approve
  voter: vcdragon
  validator: nullfame
}
```

- Logs every validator operation including virtual operations while streaming (only produces block reports during replay)
- Block reports with aggregate statistics for the block (e.g., latency, operations)
- Validator reports track follower operations (e.., pending blocks)
- Enabled via `ENABLE_EVENT_LOGS=true`, disabled by default

### Configuration

#### New

- `ENABLE_DEFAULT_LOGS=false` disables the logs provided by the reference implementation (default `true`)
- `ENABLE_EVENT_LOGS=true` enables block logging (default `false`)
- `VALIDATE_BLOCK_DELAY=0` configures leader node (default `0`)
- `VALIDATE_BLOCK_DELAY=12` configures follower node (`12` is used as an example and recommendation)

#### Updates

- `DOCKER_NAME=spsdao-validator`. The Splinterlands team naming it the `splinterlands-validator` is indicative of the complex relationship between the corporation and the DAO
- `SNAPSHOT_URL=https://backup.bamlolx.de/snapshot.zip` because this snapshot is updated more frequently than the one supplied by the corporation
- `SNAPSHOT_FILE=snapshot.zip`
- `BLOCKS_BEHIND_HEAD=6` raised to prevent supposed "microforks"
- `DB_BLOCK_RETENTION=432000` more sensible than defaulting to the entire history
- `RPC_NODES=https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network,https://techcoderx.com,https://rpc.mahdiyari.info` to add solid and remove flaky nodes per `beacon.peakd.com` results

### Runtime

- Upgraded to Node 24 with Alpine 3.21 Docker images
- Supports Amazon Linux machine images

## Future Considerations

In general, both the reference implementation and _Fire Horse Edition_ operate fine once built but require significantly more resources to build and replay than they do to operate. This limits the lower bound of hardware it can run on. For example, both operate on Amazon `t3-small` but do not operate on `t3.micro` or `t3.nano`.

The primary bottleneck is the storage layer. In specific, Postgres was chosen as the persistence layer. This is beneficial for providing a user interface with block explorer and other capabilities, but not strictly required for operating a lightweight node on minimal resources.

A separate "tiny validator" is proposed that only performs validation and check-in operations but does not rely on Postgres. The goal is a separate client with a matching hash algorithm. The first prototype was able to build and validate blocks from a 130 MB seed, a 10x improvement over the 1.3 GB postgres snapshots.

Development, and especially block hash testing, of the tiny validator required more block-level visibility of the reference implementation. That, combined with improvements to automation, led to _Fire Horse Edition_.

## Legal

[MIT License](LICENSE.md)
