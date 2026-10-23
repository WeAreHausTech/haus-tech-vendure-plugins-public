import { Type, VendureEntity } from '@vendure/core'
import { DataSource } from 'typeorm'
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata'

/** Column types a CSV cell can be matched against without a cast. */
const TEXT_COLUMN_TYPES = new Set([
  'varchar',
  'character varying',
  'nvarchar',
  'text',
  'char',
  'character',
  'nchar',
  'citext',
])

/**
 * A plain text column of the entity, so a CSV cell compares to it without a cast. Relation and
 * embedded columns (custom fields among them) are not lookups.
 */
export function findTextColumn(
  dataSource: DataSource,
  entity: Type<VendureEntity>,
  propertyName: string,
): ColumnMetadata | undefined {
  // Not findColumnWithPropertyName: it can return a custom field (embedded) column of that name.
  const column = dataSource
    .getMetadata(entity)
    .columns.find(
      (candidate) =>
        candidate.propertyName === propertyName &&
        !candidate.embeddedMetadata &&
        !candidate.relationMetadata,
    )
  if (!column) {
    return undefined
  }
  const isText = column.type === String || TEXT_COLUMN_TYPES.has(String(column.type))
  return isText ? column : undefined
}
