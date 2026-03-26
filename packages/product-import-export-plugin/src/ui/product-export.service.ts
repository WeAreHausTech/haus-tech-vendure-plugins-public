import { Injectable } from '@angular/core'
import {
  DataService,
  LocalStorageService,
  NotificationService,
  getServerLocation,
} from '@vendure/admin-ui/core'
import { Product } from '@vendure/core'

@Injectable()
export class ProductExportService {
  serverPath: string
  constructor(
    protected dataService: DataService,
    private notificationService: NotificationService,
    private localStorageService: LocalStorageService,
  ) {
    this.serverPath = getServerLocation()
  }

  async getCustomFields(productIds: string[]) {
    return fetch(`${this.serverPath}/product-export/custom-fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getHeaders(),
      },
      body: JSON.stringify(productIds),
    })
      .then((res) => res.json())
      .then((data: { name: string; type: string }[]) => {
        return data.map((field) => field.name)
      })
  }

  async getConfig() {
    return fetch(`${this.serverPath}/product-import-export/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.getHeaders(),
      },
    })
      .then((res) => res.json())
      .then((data) => data)
  }

  async exportProducts(
    selection: Product[],
    fileName?: string,
    customFields?: string[],
    exportAssetsAs?: 'url' | 'json',
    selectedExportFields?: string[],
  ) {
    this.notificationService.info(`Exporting ${selection.length} products to ${fileName}.csv`)
    const productIds = selection.map((product) => product.id)
    try {
      const res = await fetch(
        `${this.serverPath}/product-export/export?fileName=${fileName}&customFields=${customFields}&exportAssetsAs=${exportAssetsAs}&selectedExportFields=${selectedExportFields}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders(),
          },
          body: JSON.stringify(productIds),
        },
      )
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json?.message || 'Failed to export products')
      }
      const header = res.headers.get('Content-Disposition')
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const parts = header!.split(';')
      const filename = parts[1].split('=')[1]
      const blob = await res.blob()
      await this.downloadBlob(blob, filename)
    } catch (err: unknown) {
      console.error(err)
      this.notificationService.error((err as Error)?.message || 'Failed to export products')
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    const channelToken = this.localStorageService.get('activeChannelToken')
    if (channelToken) {
      headers['vendure-token'] = channelToken
    }
    const authToken = this.localStorageService.get('authToken')
    if (authToken) {
      headers.authorization = `Bearer ${authToken}`
    }
    return headers
  }

  private async downloadBlob(blob: Blob, fileName: string): Promise<void> {
    const blobUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    document.body.appendChild(a)
    a.setAttribute('hidden', 'true')
    a.href = blobUrl
    a.download = fileName
    a.setAttribute('target', '_blank')
    a.click()
  }
}
