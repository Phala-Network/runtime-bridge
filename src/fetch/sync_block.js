import toEnum from "@/utils/to_enum"
import Finity from "finity"
import pQueue from 'p-queue'
import Block from '@/models/Block'
import wait from '@/utils/wait'

const { default: Queue } = pQueue

const redisReadQueue = new Queue({ concurrency: 3000, interval: 1 })
const redisWriteQueue = new Queue({ concurrency: 60, interval: 10 })
const fetchQueue = new Queue({ concurrency: 120, interval: 100 })

const STATES = toEnum([
	'IDLE',
	'SYNCHING_OLD_BLOCKS',
	'SYNCHING_FINALIZED'
])

const EVENTS = toEnum([
	'RECEIVING_BLOCK_HEADER',
	'SYNCHED_BLOCK',
	'FINISHING_SYNCHING_OLD_BLOCKS'
])

const _setBlock = async ({ api, redis, number, timeout = 0 }) => {
	await wait(timeout)
	let block = (await redisReadQueue.add(() => Block.find({ number })))[0]
	if (!block) {
		const hash = await fetchQueue.add(() => api.rpc.chain.getBlockHash(number))
		const blockData = await fetchQueue.add(() => api.rpc.chain.getBlock(hash))
		block = new Block()
		block.property({
			number,
			hash: hash.toHex(),
			blob: blockData.toHex()
		})
		await redisWriteQueue.add(() => block.save())
		$logger.info(`Fetched block #${number}.`)
	} else {
		$logger.info(`Block #${number} found in cache.`)
	}
}
const setBlock = (...args) => {
	return _setBlock(...args).catch(e => {
		console.log(args, e)
		$logger.error(e)
		return setBlock(...args)
	})
}

const syncBlock = ({ api, redis }) => {
	let oldHighest = 0
	// const queue = new Queue({ concurrency: 200, interval: 20 })

	const syncOldBlocks = async () => {
		const tasks = []
		for (let number = 0; number < oldHighest; number++) {
			await wait(1)
			tasks.push(setBlock({ api, redis, number }))
		}
		return Promise.all(tasks)
	}

	const stateMachine = Finity.configure()
		.initialState(STATES.IDLE)
			.on(EVENTS.RECEIVING_BLOCK_HEADER)
				.transitionTo(STATES.SYNCHING_OLD_BLOCKS)
				.withAction((...{ 2: { eventPayload } }) => {
					oldHighest = eventPayload.number.toNumber()
					syncOldBlocks()
				})
		.state(STATES.SYNCHING_OLD_BLOCKS)
			.onAny().ignore()
			.on(STATES.RECEIVING_BLOCK_HEADER).ignore()
			.on(STATES.SYNCHED_BLOCK).ignore()
			.on(STATES.FINISHING_SYNCHING_OLD_BLOCKS).ignore()
		.state(STATES.SYNCHING_FINALIZED)
			.onAny().ignore()

	const worker = stateMachine.start()
	return api.rpc.chain.subscribeFinalizedHeads(header => {
		worker.handle(EVENTS.RECEIVING_BLOCK_HEADER, header)
		const number = header.number.toNumber()
		setBlock({ api, redis, number })
	})
}

export default syncBlock
