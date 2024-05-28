import powerbiVisualsApi from 'powerbi-visuals-api'
import powerbi = powerbiVisualsApi

import DataViewObject = powerbi.DataViewObject
import DataViewObjects = powerbi.DataViewObjects
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn

/**
 * Gets property value for a particular object.
 *
 * @function
 * @param {DataViewObjects} objects - Map of defined objects.
 * @param {string} objectName       - Name of desired object.
 * @param {string} propertyName     - Name of desired property.
 * @param {T} defaultValue          - Default value of desired property.
 */
export function getValue<T>(
  objects: DataViewObjects,
  objectName: string,
  propertyName: string,
  defaultValue: T
): T {
  if (objects) {
    const object = objects[objectName]
    if (object) {
      const property: T = <T>object[propertyName]
      if (property !== undefined) {
        return property
      }
    }
  }
  return defaultValue
}

/**
 * Gets property value for a particular object in a category.
 *
 * @function
 * @param {DataViewCategoryColumn} category - List of category objects.
 * @param {number} index                    - Index of category object.
 * @param {string} objectName               - Name of desired object.
 * @param {string} propertyName             - Name of desired property.
 * @param {T} defaultValue                  - Default value of desired property.
 */
export function getCategoricalObjectValue<T>(
  category: DataViewCategoryColumn,
  index: number,
  objectName: string,
  propertyName: string,
  defaultValue: T
): T {
  const categoryObjects = category.objects

  if (categoryObjects) {
    const categoryObject: DataViewObject = categoryObjects[index]
    if (categoryObject) {
      const object = categoryObject[objectName]
      if (object) {
        const property: T = <T>object[propertyName]
        if (property !== undefined) {
          return property
        }
      }
    }
  }
  return defaultValue
}
