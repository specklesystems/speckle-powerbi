# Speckle Power BI

This context defines domain language for the Speckle Power BI connector and visual.

## Language

**Material Quantities**:
A per-object collection of material quantity items from `properties.Material Quantities`, represented in the `Material Quantities` column as a list of zero or more per-material records. Each material quantity record includes `materialName` and all available leaf quantity fields for that material; objects with none have an empty list.
_Avoid_: material properties, general properties

**Material Name**:
The unique material identifier inside an object's Material Quantities subtree. It is the path segment immediately before a leaf quantity field.
_Avoid_: full material path

## Example Dialogue

Dev: "Should Material Quantities be included in the properties record?"
Domain expert: "No. Properties and Material Quantities are separate user-facing concepts; Material Quantities should be available as its own list of per-material records."
Dev: "How do I find the material name in `properties.Material Quantities.Concrete.volume`?"
Domain expert: "Use `Concrete`; the final segment is the quantity field."
