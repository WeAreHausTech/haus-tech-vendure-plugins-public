import {
  ActionBarItem,
  Badge,
  Button,
  DashboardRouteDefinition,
  detailPageRouteLoader,
  Input,
  Label,
  Page,
  PageActionBar,
  PageBlock,
  PageLayout,
  PageTitle,
  useDetailPage,
} from '@vendure/dashboard'
import { useNavigate } from '@tanstack/react-router'
import { LightbulbIcon, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  createSynonymGroupDocument,
  getSynonymGroupDetailDocument,
  updateSynonymGroupDocument,
} from './gql'

function SynonymGroupDetailPage({ route }: { route: { useParams: () => { id: string } } }) {
  const params = route.useParams()
  const navigate = useNavigate()
  const creatingNewEntity = params.id === 'new'
  const [synonyms, setSynonyms] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const entityIdRef = useRef<string | null>(null)

  const setValuesForUpdate = useCallback(
    (
      synonymGroup:
        | {
          id: string
          synonyms: string[]
          createdAt: string
          updatedAt: string
          languageCode: string
        }
        | null
        | undefined,
    ) => {
      const initialSynonyms = synonymGroup?.synonyms ?? []
      return {
        id: synonymGroup?.id ?? '',
        synonyms: initialSynonyms,
      }
    },
    [],
  )

  const {
    form,
    submitHandler: baseSubmitHandler,
    entity,
    isPending,
    resetForm,
    refreshEntity,
  } = useDetailPage({
    queryDocument: getSynonymGroupDetailDocument,
    createDocument: createSynonymGroupDocument,
    updateDocument: updateSynonymGroupDocument,
    setValuesForUpdate,
    params: { id: params.id },
    onSuccess: async (data) => {
      toast.success('Successfully saved synonym group')
      resetForm()
      if (creatingNewEntity) {
        await navigate({ to: `/synonyms/${data.id}` })
      } else {
        await refreshEntity()
      }
    },
    onError: (err) => {
      toast.error('Failed to save synonym group', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  useEffect(() => {
    if (entity && entity.id && entity.id !== entityIdRef.current) {
      entityIdRef.current = entity.id
      const entitySynonyms = entity.synonyms ?? []
      setSynonyms([...entitySynonyms])
    } else if (!entity && !creatingNewEntity) {
      entityIdRef.current = null
      setSynonyms([])
    }
  }, [entity?.id, creatingNewEntity])

  const updateSynonymsInForm = (newSynonyms: string[]) => {
    setSynonyms(newSynonyms)
    form.setValue('synonyms', newSynonyms, { shouldDirty: true })
  }

  const handleTagKeydown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addTagFromInput()
    }
  }

  const addTagFromInput = () => {
    const raw = newTag.trim()
    if (!raw) return
    const candidates = raw
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token)
    const toAdd = candidates.filter((c) => !synonyms.includes(c))
    if (toAdd.length > 0) {
      updateSynonymsInForm([...synonyms, ...toAdd])
    }
    setNewTag('')
  }

  const removeTag = (index: number) => {
    updateSynonymsInForm(synonyms.filter((_, i) => i !== index))
  }

  const submitHandler = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (synonyms.length === 0) {
      toast.error('At least one synonym is required')
      return
    }
    form.setValue('synonyms', synonyms, { shouldValidate: true })
    await baseSubmitHandler(e)
  }

  const canSubmit = synonyms.length > 0 && form.formState.isValid
  const previewTerm = synonyms[0]
  const matchedTerms = synonyms.slice(1)

  return (
    <Page pageId="synonym-group-detail" form={form} submitHandler={submitHandler}>
      <PageTitle>
        {creatingNewEntity ? 'New synonym set' : 'Manage synonym set'}
      </PageTitle>
      <PageActionBar>
        <ActionBarItem itemId="cancel-synonym-group">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: '/synonyms' })}
          >
            Cancel
          </Button>
        </ActionBarItem>
        <ActionBarItem itemId="save-synonym-group">
          <Button
            type="submit"
            disabled={!form.formState.isDirty || !canSubmit || isPending}
          >
            {creatingNewEntity ? 'Create' : 'Save changes'}
          </Button>
        </ActionBarItem>
      </PageActionBar>
      <PageLayout>
        <PageBlock column="side" blockId="synonym-help">
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <LightbulbIcon className="h-4 w-4 text-muted-foreground" />
              <p className="font-medium">Tips & examples</p>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Add two or more words that should match each other in search. Searching for any term
              in the set can return products that match any other term in the same group.
            </p>
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <p className="font-medium">Example set</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">tv</Badge>
                <Badge variant="secondary">television</Badge>
                <Badge variant="secondary">flatscreen</Badge>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                A customer searching for &quot;tv&quot; can find products indexed with
                &quot;television&quot;, and vice versa.
              </p>
            </div>

          </div>
        </PageBlock>
        <PageBlock column="main" blockId="main-form">
          <div className="space-y-6">

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <Label>Terms in this set ({synonyms.length})</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                All terms in this set are treated as equivalent in search.
              </p>
              <div className="flex flex-wrap gap-2 min-h-8">
                {synonyms.map((tag, index) => (
                  <Badge
                    key={`${tag}-${index}`}
                    variant="secondary"
                    className="flex items-center gap-1 pr-1"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(index)}
                      className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex max-w-md gap-2 items-center">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={handleTagKeydown}
                  placeholder="Type a term and press Enter"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addTagFromInput}
                  disabled={!newTag.trim()}
                >
                  Add
                </Button>
              </div>
              {synonyms.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Add at least two terms for a useful synonym set.
                </p>
              )}
            </div>

          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  )
}

export const synonymGroupDetail: DashboardRouteDefinition = {
  path: '/synonyms/$id',
  loader: detailPageRouteLoader({
    queryDocument: getSynonymGroupDetailDocument,
    breadcrumb: (isNew) => [
      { path: '/synonyms', label: 'Synonyms' },
      isNew ? 'New synonym set' : 'Manage synonym set',
    ],
  }),
  component: (route) => {
    return <SynonymGroupDetailPage route={route} />
  },
}
