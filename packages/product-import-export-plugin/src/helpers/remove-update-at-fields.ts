type AnyObject = { [key: string]: any }

export function removeUpdatedAtFields<T extends AnyObject | any[]>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => removeUpdatedAtFields(item)) as T
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj: AnyObject = {}
    for (const key in obj) {
      if (key !== 'updatedAt') {
        newObj[key] = removeUpdatedAtFields(obj[key as keyof AnyObject])
      }
    }
    return newObj as T
  }
  return obj // Return the value if it's not an object or array
}
