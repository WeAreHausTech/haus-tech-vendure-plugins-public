import {
  DashboardRouteDefinition,
  detailPageRouteLoader,
  useDetailPage,
  Page,
  PageTitle,
  PageActionBar,
  ActionBarItem,
  PageLayout,
  PageBlock,
  FormFieldWrapper,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  RelationSelector,
  Label,
  VendureImage,
} from '@vendure/dashboard'
import { AnyRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@vendure/dashboard'
import {
  getBadgeDetailDocument,
  createBadgeDocument,
  updateBadgeDocument,
  getBadgePluginConfigDocument,
  getCollectionsDocument,
  createAssetsDocument,
} from './gql'
import { UploadIcon } from 'lucide-react'
import type { ComponentProps } from 'react'

export const badgeDetailRoute: DashboardRouteDefinition = {
  path: '/badges/$id',
  loader: detailPageRouteLoader({
    queryDocument: getBadgeDetailDocument,
    breadcrumb: (isNew, entity) => [
      { path: '/badges', label: 'Badges' },
      isNew ? 'New Badge' : `Badge ${entity?.id || ''}`,
    ],
  }),
  component: (route) => {
    return <BadgeDetailPage route={route as AnyRoute} />
  },
}

function BadgeDetailPage({ route }: { route: AnyRoute }) {
  const params = route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const creatingNewEntity = params.id === 'new'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedAsset, setUploadedAsset] = useState<{
    id: string
    name: string
    preview: string
    source: string
  } | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data: configData } = useQuery({
    queryKey: ['badge-plugin-config'],
    queryFn: () => api.query(getBadgePluginConfigDocument),
  })

  const availablePositions = configData?.getBadgePluginConfig?.availablePositions || []

  const collectionSelectorConfig = {
    listQuery: getCollectionsDocument,
    idKey: 'id' as const,
    labelKey: 'name' as const,
    placeholder: 'Search collections...',
  }

  const setValuesForUpdate = useCallback(
    (
      badge:
        | {
          id: string
          position: string
          collectionId: string | null
          assetId: string
          asset: {
            id: string
            name: string
            preview: string
          }
        }
        | null
        | undefined,
    ) => {
      const position =
        badge?.position && badge.position.trim() !== ''
          ? badge.position
          : availablePositions?.length > 0
            ? availablePositions[0]
            : ''

      return {
        id: badge?.id ?? '',
        position: position || 'top-left',
        collectionId: badge?.collectionId ?? null,
        assetId: badge?.assetId ?? '',
      }
    },
    [availablePositions],
  )

  const { form, submitHandler, entity, isPending, resetForm, refreshEntity } = useDetailPage({
    queryDocument: getBadgeDetailDocument,
    createDocument: creatingNewEntity ? createBadgeDocument : undefined,
    updateDocument: creatingNewEntity ? undefined : updateBadgeDocument,
    setValuesForUpdate,
    params: creatingNewEntity ? { id: 'new' } : { id: params.id },
    onSuccess: async (data) => {
      toast.success(creatingNewEntity ? 'Successfully created badge' : 'Successfully saved badge')
      resetForm()
      if (creatingNewEntity) {
        await navigate({ to: `/badges/${data.id}` })
      } else {
        await refreshEntity()
      }
      queryClient.invalidateQueries({ queryKey: ['badges'] })
    },
    onError: (err) => {
      toast.error(creatingNewEntity ? 'Failed to create badge' : 'Failed to save badge', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  const createAssetMutation = useMutation({
    mutationFn: async (file: File) => {
      const input = [{ file }]
      const result = await api.mutate(createAssetsDocument, { input }) as {
        createAssets: Array<{ id?: string; name?: string; source?: string; preview?: string; message?: string }>
      }
      const assetResult = result.createAssets[0]
      if ('id' in assetResult) {
        return assetResult
      } else if ('message' in assetResult) {
        throw new Error(assetResult.message)
      }
      throw new Error('Failed to upload asset')
    },
    onSuccess: (asset) => {
      setUploadedAsset({
        id: asset.id,
        name: asset.name || 'Uploaded image',
        preview: asset.preview || '',
        source: asset.source || asset.preview || '',
      })
      form.setValue('assetId', asset.id, { shouldDirty: true, shouldValidate: true })
      setUploading(false)
      toast.success('Image uploaded successfully')
    },
    onError: (error) => {
      toast.error('Failed to upload image', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setUploading(false)
    },
  })

  // Track synced entity ID to prevent re-syncing
  const syncedEntityIdRef = useRef<string | null>(null)
  const entityIdRef = useRef<string | null>(null)

  // Sync uploadedAsset state when entity changes (only when entity.id changes)
  useEffect(() => {
    if (entity?.id && entity.id !== entityIdRef.current) {
      entityIdRef.current = entity.id
      syncedEntityIdRef.current = null // Reset sync tracking when entity changes
      if (entity?.asset) {
        setUploadedAsset({
          id: entity.asset.id,
          name: entity.asset.name,
          preview: entity.asset.preview,
          source: entity.asset.source,
        })
      }
    }
  }, [entity?.id, entity?.asset])

  // Sync form values when entity loads (for edit mode)
  // Run whenever entity data or availablePositions changes
  useEffect(() => {
    const badge = entity
    if (!creatingNewEntity && badge?.id) {
      const entityPosition = badge.position
      const entityCollectionId = badge.collectionId

      // Set position - use entity value if available, otherwise keep what's there
      if (entityPosition) {
        if (availablePositions.length > 0 && availablePositions.includes(entityPosition)) {
          form.setValue('position', entityPosition, { shouldDirty: false })
        } else if (availablePositions.length === 0) {
          // If positions not loaded yet, set it anyway (will be validated later)
          form.setValue('position', entityPosition, { shouldDirty: false })
        }
      }

      // Always sync collection - set it immediately
      form.setValue('collectionId', entityCollectionId ?? null, { shouldDirty: false })
      form.setValue('assetId', badge.assetId ?? '', { shouldDirty: false })
    }

    // Initialize default values for new badges
    if (creatingNewEntity && availablePositions.length > 0) {
      form.setValue('position', availablePositions[0])
      form.setValue('collectionId', null)
    }
  }, [entity, availablePositions, creatingNewEntity, form])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file')
        return
      }
      setUploading(true)
      createAssetMutation.mutate(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (creatingNewEntity) {
      if (!uploadedAsset?.id) {
        toast.error('Please upload an image first')
        return
      }

      const formValues = form.getValues()
      try {
        const result = await api.mutate(createBadgeDocument, {
          input: {
            assetId: uploadedAsset.id,
            position: formValues.position || availablePositions[0] || 'top-left',
            collectionId: formValues.collectionId || null,
          },
        })

        toast.success('Badge created successfully')
        await navigate({ to: `/badges/${result.createBadge.id}` })
        queryClient.invalidateQueries({ queryKey: ['badges'] })
      } catch (error: unknown) {
        toast.error('Failed to create badge', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      }
      return
    }

    await submitHandler(e)
  }

  const currentAsset =
    uploadedAsset ||
    (entity?.asset
      ? {
        id: entity.asset.id,
        name: entity.asset.name,
        preview: entity.asset.preview,
        source: entity.asset.source,
      }
      : null)
  const currentAssetForPreview =
    currentAsset == null
      ? null
      : (entity?.asset && currentAsset.id === entity.asset.id
        ? entity.asset
        : { ...currentAsset, type: 'IMAGE' }) as ComponentProps<typeof VendureImage>['asset']
  const hasAssetChanged = Boolean(
    !creatingNewEntity && uploadedAsset?.id && uploadedAsset.id !== entity?.assetId,
  )

  return (
    <Page pageId="badge-detail" form={form} submitHandler={handleSubmit}>
      <PageTitle>
        {creatingNewEntity ? 'New Badge' : entity?.id ? `Badge ${entity.id}` : 'Edit Badge'}
      </PageTitle>
      <PageActionBar>
        <ActionBarItem itemId="save-button">
          <Button
            type="submit"
            disabled={
              creatingNewEntity
                ? !uploadedAsset || !form.formState.isValid || isPending || uploading
                : (!form.formState.isDirty && !hasAssetChanged) || isPending || uploading
            }
          >
            {isPending || uploading ? 'Saving...' : creatingNewEntity ? 'Create' : 'Update'}
          </Button>
        </ActionBarItem>
      </PageActionBar>
      <PageLayout>
        <PageBlock column="main" blockId="main-form">
          <div className="space-y-4">
            <div className="space-y-2" style={{ maxWidth: '400px' }}>
              <Label>Image</Label>
              <div className="space-y-4">
                {currentAsset ? (
                  <div className="space-y-2">
                    <VendureImage asset={currentAssetForPreview} alt={currentAsset.name} preset="full" />
                    <div className="text-sm text-muted-foreground">{currentAsset.name}</div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
                    <UploadIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-4">No image uploaded</p>
                  </div>
                )}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full"
                  >
                    <UploadIcon className="mr-2 h-4 w-4" />
                    {uploading ? 'Uploading...' : currentAsset ? 'Change Image' : 'Upload Image'}
                  </Button>
                </div>
              </div>
            </div>

            <div style={{ maxWidth: '700px' }} className="space-y-4">
              <FormFieldWrapper
                control={form.control}
                name="position"
                label="Position"
                render={({ field }) => {
                  // Ensure value is valid - use field.value if it exists and is in availablePositions, otherwise empty string
                  const validValue =
                    field.value && availablePositions.includes(field.value) ? field.value : ''
                  return (
                    <Select value={validValue} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePositions.map((pos) => (
                          <SelectItem key={pos} value={pos}>
                            {pos}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                }}
              />
              <FormFieldWrapper
                control={form.control}
                name="collectionId"
                label="Collection"
                render={({ field }) => (
                  <RelationSelector
                    config={collectionSelectorConfig}
                    value={field.value ?? undefined}
                    onChange={(val) => field.onChange(val ?? null)}
                    selectorLabel="No collection"
                  />
                )}
              />
            </div>
          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  )
}
