import toEnum from "@/utils/to_enum"
import Finity from "finity"
import pQueue from 'p-queue'

import wait from '@/utils/wait'

const { default: Queue } = pQueue

const redisReadQueue = new Queue({ concurrency: 3000, interval: 1 })
const redisWriteQueue = new Queue({ concurrency: 60, interval: 10 })
const fetchQueue = new Queue({ concurrency: 60, interval: 100 })

const STATES = toEnum([
	'IDLE',
	'SYNCHING_OLD_BLOCKS',
	'SYNCHING_FINALIZED'
])

const EVENTS = toEnum([
	'RECEIVING_BLOCK_HEADER',
	'FINISHING_SYNCHING_OLD_BLOCKS'
])

const _setBlock = async ({ api, number, timeout = 0, chainName, BlockModel }) => {
	await wait(timeout)
	let block = (await redisReadQueue.add(() => BlockModel.find({ number })))[0]
	if (!block) {
		const hash = await fetchQueue.add(() => api.rpc.chain.getBlockHash(number))
		const blockData = await fetchQueue.add(() => api.rpc.chain.getBlock(hash))
		block = new BlockModel()
		block.property({
			number,
			hash: hash.toHex(),
			blob: blockData.toHex()
		})
		await redisWriteQueue.add(() => block.save())
		$logger.info(`Fetched block #${number}.`, { label: chainName })
	} else {
		$logger.info(`Block #${number} found in cache.`, { label: chainName })
	}
}
const setBlock = (...args) => {
	return _setBlock(...args).catch(e => {
		console.log(args, e)
		$logger.error(e)
		return setBlock(...args)
	})
}

const syncBlock = ({ api, redis, chainName, BlockModel }) => new Promise(resolve => {
	let oldHighest = 0

	const syncOldBlocks = async () => {
		const tasks = []
		for (let number = 0; number < oldHighest; number++) {
			await wait(1)
			tasks.push(setBlock({ api, redis, number, chainName, BlockModel }))
		}
		return Promise.all(tasks)
	}

	const stateMachine = Finity.configure()
		.initialState(STATES.IDLE)
			.on(EVENTS.RECEIVING_BLOCK_HEADER)
				.transitionTo(STATES.SYNCHING_OLD_BLOCKS)
				.withAction((...{ 2: { eventPayload: header } }) => {
					$logger.info('Start synching blocks...', { label: chainName })
					oldHighest = header.number.toNumber()
					syncOldBlocks()
						.then(() => worker.handle(EVENTS.FINISHING_SYNCHING_OLD_BLOCKS))
				})
		.state(STATES.SYNCHING_OLD_BLOCKS)
			.on(STATES.FINISHING_SYNCHING_OLD_BLOCKS)
				.transitionTo(STATES.SYNCHING_FINALIZED)
				.withAction(() => {
					$logger.info('Old blocks synched.', { label: chainName })
					resolve()
				})
			.onAny().ignore()
		.state(STATES.SYNCHING_FINALIZED)
			.onAny().ignore()

	const worker = stateMachine.start()
	api.rpc.chain.subscribeFinalizedHeads(header => {
		const number = header.number.toNumber()

		if (oldHighest <= 0) {
			worker.handle(EVENTS.RECEIVING_BLOCK_HEADER, header)
		}
		
		setBlock({ api, redis, number, chainName, BlockModel })
	})
})

export default syncBlock
