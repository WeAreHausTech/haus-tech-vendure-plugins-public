import { ID } from '@vendure/core'

export type AddNoteToOrderInput = {
  id: ID
  note: string
  fromCustomer?: boolean
  readAt?: string
}

export type MutationAddNoteToOrderArgs = {
  input: AddNoteToOrderInput
}

export type SetOrderNoteReadInputData = {
  id: ID
  isPublic: boolean
  note: string
}

export type SetOrderNoteReadInput = {
  id: ID
  read: boolean
  data: SetOrderNoteReadInputData
}

export type MutationSetOrderNoteReadArgs = {
  input: SetOrderNoteReadInput
}
