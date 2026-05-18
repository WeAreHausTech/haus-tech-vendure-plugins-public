import {
  ActionBarItem,
  Badge,
  Button,
  DashboardRouteDefinition,
  ListPage,
} from '@vendure/dashboard'
import { Link } from '@tanstack/react-router'
import { PencilIcon, PlusIcon } from 'lucide-react'
import { deleteSynonymGroupDocument, getSynonymGroupList } from './gql'

const VISIBLE_TERM_LIMIT = 4

function SynonymTermsCell({ synonyms }: { synonyms: string[] }) {
  const visible = synonyms.slice(0, VISIBLE_TERM_LIMIT)
  const remaining = synonyms.length - VISIBLE_TERM_LIMIT

  return (
    <div className="flex flex-wrap items-center gap-1.5 max-w-[32rem]">
      {visible.map((term) => (
        <Badge key={term} variant="secondary">
          {term}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="outline">+{remaining}</Badge>
      )}
    </div>
  )
}

export const synonymGroupList: DashboardRouteDefinition = {
  navMenuItem: {
    sectionId: 'settings',
    id: 'synonyms',
    url: '/synonyms',
    title: 'Synonyms',
  },
  path: '/synonyms',
  loader: () => ({
    breadcrumb: 'Synonyms',
  }),
  component: (route) => {
    const navigate = route.useNavigate()

    return (
      <ListPage
        pageId="synonym-group-list"
        title={
          <div className="flex flex-col gap-1">
            <span>Synonym sets</span>
            <span className="text-sm font-normal text-muted-foreground">
              Connect similar search terms to improve product discovery and search accuracy.
            </span>
          </div>
        }
        listQuery={getSynonymGroupList}
        deleteMutation={deleteSynonymGroupDocument}
        route={route}
        defaultSort={[{ id: 'updatedAt', desc: true }]}
        onSearchTermChange={(searchTerm) =>
          searchTerm
            ? {
              synonyms: { contains: searchTerm },
            }
            : {}
        }

        customizeColumns={{
          synonyms: {
            header: 'Terms',
            meta: {
              dependencies: ['synonyms'],
            },
            cell: ({ row }) => (
              <SynonymTermsCell synonyms={row.original.synonyms ?? []} />
            ),
          },
          updatedAt: {
            header: 'Last updated',
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
              navigate({ to: `/synonyms/${row.id}` })
            },
          },
        ]}
        defaultVisibility={{
          synonyms: true,
          updatedAt: true,
          id: false,
          languageCode: false,
        }}
        defaultColumnOrder={['synonyms', 'updatedAt']}
      >
        <ActionBarItem itemId="create-synonym-group">
          <Button render={<Link to="./new" />}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Create synonym set
          </Button>
        </ActionBarItem>
      </ListPage>
    )
  },
}
