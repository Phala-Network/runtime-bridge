import Finity from "finity"
import toEnum from "@/utils/to_enum"
import { protoRoot } from '@/message/proto'

const Status = protoRoot.lookupEnum('WorkerState.Status')
const StatusEnumValues = Status.values

const EVENTS = toEnum([
  'SHOULD_START',
  'SHOULD_MARK_PENDING_SYNCHING',
  'SHOULD_MARK_SYNCHING',
  'SHOULD_MARK_ONLINE',
  'SHOULD_KICK',
  'ERROR'
])

const stateMachine = Finity.configure()

stateMachine.initialState(StatusEnumValues.S_IDLE)

stateMachine.state(StatusEnumValues.S_STARTING)
stateMachine.state(StatusEnumValues.S_PENDING_SYNCHING)
stateMachine.state(StatusEnumValues.S_SYNCHING)
stateMachine.state(StatusEnumValues.S_ONLINE)
stateMachine.state(StatusEnumValues.S_KICKED)
stateMachine.state(StatusEnumValues.S_ERROR)

const createWorkerState = ({ machine, context }) => {
  const sm = stateMachine.start()
}

export {
  createWorkerState
}
