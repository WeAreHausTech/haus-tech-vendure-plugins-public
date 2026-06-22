import {
  DashboardRouteDefinition,
  ListPage,
  ActionBarItem,
  Button,
  VendureImage,
  Badge as BadgeComponent,
} from '@vendure/dashboard'
import { PencilIcon, PlusIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { graphql } from './gql'

const getBadgeListDocument = graphql(`
  query GetBadges($options: BadgeListOptions) {
    badges(options: $options) {
      items {
        id
        createdAt
        updatedAt
        collection {
          id
          name
        }
        collectionId
        position
        asset {
          id
          name
          type
          mimeType
          width
          height
          fileSize
          source
          preview
        }
      }
      totalItems
    }
  }
`)

const deleteBadgeDocument = graphql(`
  mutation DeleteBadge($id: ID!) {
    deleteBadge(ids: [$id]) {
      result
      message
    }
  }
`)

export const badgeListRoute: DashboardRouteDefinition = {
  navMenuItem: {
    sectionId: 'catalog',
    id: 'badges',
    url: '/badges',
    title: 'Badges',
  },
  path: '/badges',
  loader: () => ({
    breadcrumb: 'Badges',
  }),
  component: (route) => {
    const navigate = route.useNavigate()

    return (
      <ListPage
        pageId="badge-list"
        title="Badges"
        listQuery={getBadgeListDocument}
        deleteMutation={deleteBadgeDocument}
        route={route}
        customizeColumns={{
          asset: {
            cell: ({ row }) => {
              const badge = row.original
              return (
                <div className="flex items-center gap-2">
                  <VendureImage
                    asset={badge.asset}
                    alt={badge.asset.name}
                    preset="thumb"
                    className="w-12 h-12 object-cover rounded"
                  />
                </div>
              )
            },
          },
          position: {
            cell: ({ row }) => {
              return <BadgeComponent variant="secondary">{row.original.position}</BadgeComponent>
            },
          },
          collection: {
            cell: ({ row }) => {
              const badge = row.original
              return badge.collection ? (
                <Link
                  to={`/collections/${badge.collection.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  {badge.collection.name}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )
            },
          },
        }}
        rowActions={[
          {
            label: (
              <>
                <PencilIcon className="mr-2 h-4 w-4" />
                Edit
              </>
            ),
            onClick: (row) => {
              navigate({ to: `/badges/${row.id}` })
            },
          },
        ]}
        defaultVisibility={{
          asset: true,
          position: true,
          collection: true,
          updatedAt: true,
        }}
        defaultColumnOrder={['asset', 'position', 'collection', 'updatedAt']}
      >
        <ActionBarItem itemId="create-button">
          <Button render={<Link to="./new" />}>
            <PlusIcon />
            New Badge
          </Button>
        </ActionBarItem>
      </ListPage>
    )
  },
}
