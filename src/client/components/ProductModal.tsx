import { adminFetch } from "../adminFetch";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { inputStyle, secondaryButtonStyle } from "./uiStyles";
import { matchingBoxName } from "../../shared/caseProduct";
import ProductImageManager from "./ProductImageManager";

export type ProductUnitType = "CASE" | "BOX" | "ITEM";

export type CatalogProduct = {
  id: number;
  itemId: string;
  name: string;
  displayName: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  type: "SEALED" | "SINGLE";
  unitType: ProductUnitType;
  parentProductId: number | null;
  quantityPerParent: number | null;
  sellable: boolean;
  active: boolean;
  expectedSalePrice: string | number | null;
  publicVisible: boolean;
  publicPrice: string | number | null;
  featured: boolean;
  packsPerBox: number | null;
  packDisplayName: string | null;
  defaultPackPrice: string | number | null;
};

type NewProductForm = {
  itemId: string;
  name: string;
  displayName: string;
  shortDescription: string;
  type: "SEALED" | "SINGLE";
  unitType: ProductUnitType;
  parentProductId: string;
  quantityPerParent: string;
  boxItemId: string;
  boxesPerCase: string;
  boxExpectedSalePrice: string;
  expectedSalePrice: string;
  publicVisible: boolean;
  publicPrice: string;
  featured: boolean;
  packsPerBox: string;
  packDisplayName: string;
  defaultPackPrice: string;
  sellable: boolean;
};
export default function ProductModal({
  mode,
  product,
  products,
  onClose,
  onSaved,
  onImageChanged,
}: {
  mode: "add" | "edit";
  product?: CatalogProduct;
  products: CatalogProduct[];
  onClose: () => void;
  onSaved: (product: CatalogProduct) => Promise<void> | void;
  onImageChanged?: (productId: number, imageUrl: string | null) => void;
}) {
  const isEditing = mode === "edit";
  const existingBox = products.find((child) => child.parentProductId === product?.id);

  const [form, setForm] =
    useState<NewProductForm>({
      itemId: product?.itemId ?? "",
      name: product?.name ?? "",
      displayName: product?.displayName ?? "",
      shortDescription: product?.shortDescription ?? "",
      type: product?.type ?? "SEALED",
      unitType: product?.unitType ?? "BOX",
      parentProductId: product?.parentProductId?.toString() ?? "",
      quantityPerParent: product?.quantityPerParent?.toString() ?? "",
      boxItemId: existingBox?.itemId ?? "",
      boxesPerCase: existingBox?.quantityPerParent?.toString() ?? "",
      boxExpectedSalePrice: existingBox?.expectedSalePrice?.toString() ?? "",
      expectedSalePrice:
        product?.expectedSalePrice ===
          null ||
        product?.expectedSalePrice ===
          undefined
          ? ""
          : String(
              product.expectedSalePrice
            ),
      publicVisible:
        product?.publicVisible ?? false,
      publicPrice:
        product?.publicPrice === null ||
        product?.publicPrice === undefined
          ? ""
          : String(product.publicPrice),
      featured:
        product?.featured ?? false,
      packsPerBox: product?.packsPerBox?.toString() ?? "",
      packDisplayName: product?.packDisplayName ?? "",
      defaultPackPrice: product?.defaultPackPrice === null || product?.defaultPackPrice === undefined
        ? ""
        : String(product.defaultPackPrice),
      sellable:
        product?.sellable ?? true,
    });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [imageUrl, setImageUrl] =
    useState<string | null>(product?.imageUrl ?? null);

  function updateForm<
    K extends keyof NewProductForm,
  >(
    field: K,
    value: NewProductForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "unitType" && value === "CASE" ? {type: "SEALED" as const} : {}),
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const itemId = form.itemId.trim();
    const name = form.name.trim();

    if (form.unitType === "CASE" && (
      !form.boxItemId.trim() || !Number.isSafeInteger(Number(form.boxesPerCase)) ||
      Number(form.boxesPerCase) <= 0
    )) {
      setError("Enter a Box Item ID and a positive whole-number boxes-per-case quantity.");
      return;
    }
    if (form.unitType !== "CASE" && form.parentProductId && (
      !Number.isInteger(Number(form.quantityPerParent)) ||
      Number(form.quantityPerParent) <= 0
    )) {
      setError("Units per parent must be a positive whole number.");
      return;
    }

    if (!itemId) {
      setError(
        "Item ID is required."
      );
      return;
    }

    if (!name) {
      setError(
        "Product name is required."
      );
      return;
    }

    if (
      form.expectedSalePrice !== "" &&
      Number(form.expectedSalePrice) < 0
    ) {
      setError(
        "Expected sale price cannot be negative."
      );
      return;
    }

    if (
      form.publicPrice !== "" &&
      Number(form.publicPrice) < 0
    ) {
      setError(
        "Public price cannot be negative."
      );
      return;
    }

    if (form.unitType === "BOX") {
      const hasPackConfiguration = form.packsPerBox !== "" || form.packDisplayName.trim() !== "" || form.defaultPackPrice !== "";
      if (hasPackConfiguration && (!Number.isSafeInteger(Number(form.packsPerBox)) || Number(form.packsPerBox) <= 0 || !form.packDisplayName.trim())) {
        setError("Packs per Box and Pack Display Name must be configured together.");
        return;
      }
      if (form.defaultPackPrice !== "" && (!Number.isFinite(Number(form.defaultPackPrice)) || Number(form.defaultPackPrice) < 0)) {
        setError("Default pack price must be a valid non-negative number.");
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);

      const endpoint = isEditing
        ? `/api/products/${product?.id}`
        : "/api/products";

      const response = await adminFetch(
        endpoint,
        {
          method: isEditing
            ? "PATCH"
            : "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            itemId,
            name,
            displayName: form.displayName.trim() || null,
            shortDescription: form.shortDescription.trim() || null,
            type: form.type,
            unitType: form.unitType,

            // The contained product stores its parent and conversion quantity.
            parentProductId: form.unitType !== "CASE" && form.parentProductId ? Number(form.parentProductId) : null,
            quantityPerParent: form.unitType !== "CASE" && form.parentProductId ? Number(form.quantityPerParent) : null,
            ...(form.unitType === "CASE" ? {
              boxItemId: form.boxItemId,
              boxesPerCase: Number(form.boxesPerCase),
              boxExpectedSalePrice: form.boxExpectedSalePrice,
            } : {}),
            ...(!isEditing
              ? {
                  active: true,
                }
              : {}),

            sellable: form.unitType === "CASE" ? false : form.sellable,

            expectedSalePrice:
              form.expectedSalePrice ===
              ""
                ? null
                : Number(
                    form.expectedSalePrice
                  ),

            publicVisible:
              form.publicVisible,

            publicPrice:
              form.publicPrice === ""
                ? null
                : Number(form.publicPrice),

            featured:
              form.featured,

            packsPerBox: form.unitType === "BOX" && form.packsPerBox !== ""
              ? Number(form.packsPerBox)
              : null,
            packDisplayName: form.unitType === "BOX"
              ? form.packDisplayName.trim() || null
              : null,
            defaultPackPrice: form.unitType === "BOX" && form.defaultPackPrice !== ""
              ? Number(form.defaultPackPrice)
              : null,
          }),
        }
      );

      if (!response.ok) {
        const responseBody =
          await response
            .json()
            .catch(() => null);

        throw new Error(
          responseBody?.error ??
            (isEditing
              ? "Product could not be updated."
              : "Product could not be created.")
        );
      }

      const savedProduct = await response.json() as CatalogProduct;
      await onSaved(savedProduct);
    } catch (error) {
      console.error(
        isEditing
          ? "Product update error:"
          : "Product creation error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : isEditing
            ? "Product could not be updated."
            : "Product could not be created."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="modal-surface modal-surface--product product-modal"
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent:
              "space-between",
            gap: "20px",
            padding: "22px 24px",
            borderBottom:
              "1px solid #24252a",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "18px",
              }}
            >
              {isEditing
                ? "Edit Product"
                : "Add Product"}
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                color: "#777880",
                fontSize: "12px",
              }}
            >
              {isEditing
                ? "Update this product's catalog details."
                : "Create a new product in the Double Rare catalog."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: 0,
              background:
                "transparent",
              color: "#777880",
              cursor: "pointer",
              fontSize: "20px",
            }}
          >
            ×
          </button>
        </div>

        <form
          className="product-form-grid"
          onSubmit={handleSubmit}
          style={{
            padding: "24px",
          }}
        >
          <FormField
            label="Item ID"
            hint="A unique internal identifier, such as PRIS-BOX."
          >
            <input
              value={form.itemId}
              onChange={(event) =>
                updateForm(
                  "itemId",
                  event.target.value
                )
              }
              placeholder="PRIS-BOX"
              autoFocus
              style={inputStyle}
            />
          </FormField>

          <FormField
            label="Product Name"
            hint="The canonical name used by admin and business workflows."
          >
            <input
              value={form.name}
              onChange={(event) =>
                updateForm(
                  "name",
                  event.target.value
                )
              }
              placeholder="Prismatic Evolutions Box"
              style={inputStyle}
            />
          </FormField>

          <FormField
            label="Product Type"
            hint="Singles are supported by the data model, but we're currently focused on sealed inventory."
          >
            <select
              value={form.type}
              disabled={form.unitType === "CASE"}
              onChange={(event) =>
                updateForm(
                  "type",
                  event.target
                    .value as
                    | "SEALED"
                    | "SINGLE"
                )
              }
              style={inputStyle}
            >
              <option value="SEALED">
                Sealed
              </option>

              <option value="SINGLE">
                Single
              </option>
            </select>
          </FormField>

          <FormField label="Unit Type">
            <select
              value={form.unitType}
              onChange={(event) =>
                updateForm(
                  "unitType",
                  event.target.value as ProductUnitType
                )
              }
              style={inputStyle}
            >
              <option value="CASE">
                Case
              </option>

              <option value="BOX">
                Box
              </option>

              <option value="ITEM">
                Item
              </option>
            </select>
          </FormField>

          {form.unitType === "CASE" && (
            <>
              <FormField label="Matching Box Name" hint="The Case and its matching Box are saved together. Cases are never sellable.">
                <input readOnly value={matchingBoxName(form.name)} style={inputStyle} />
              </FormField>
              <FormField label="Box Item ID" hint="Use a unique ID, or the ID of an existing unlinked Box with this matching name.">
                <input required value={form.boxItemId}
                  onChange={(event) => updateForm("boxItemId", event.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Boxes per Case">
                <input type="number" min="1" step="1" required value={form.boxesPerCase}
                  onChange={(event) => updateForm("boxesPerCase", event.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Expected Sale Price per Box">
                <input type="number" min="0" step="0.01" value={form.boxExpectedSalePrice}
                  onChange={(event) => updateForm("boxExpectedSalePrice", event.target.value)} style={inputStyle} />
              </FormField>
            </>
          )}

          {form.unitType !== "CASE" && <>
          <FormField
            label="Parent / Container Product"
            hint="For a Box sold from a Case, select its Case here. Leave blank for products without a container."
          >
            <select
              value={form.parentProductId}
              onChange={(event) => updateForm("parentProductId", event.target.value)}
              style={inputStyle}
            >
              <option value="">No parent</option>
              {products.filter((parent) =>
                parent.id !== product?.id &&
                (parent.unitType !== "CASE" || parent.id === product?.parentProductId) &&
                (parent.active || parent.id === product?.parentProductId)
              ).map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.itemId} — {parent.name} ({parent.unitType})
                </option>
              ))}
            </select>
          </FormField>

          {form.parentProductId && (
            <FormField
              label="Units per Parent"
              hint="Example: enter 20 on the Box product when one Case contains 20 Boxes. This sets catalog metadata; it does not change inventory."
            >
              <input
                type="number"
                min="1"
                step="1"
                required
                value={form.quantityPerParent}
                onChange={(event) => updateForm("quantityPerParent", event.target.value)}
                style={inputStyle}
              />
            </FormField>
          )}

          <FormField
            label="Expected Sale Price"
            hint="Used to calculate retail inventory value and potential profit."
          >
            <div
              style={{
                position: "relative",
              }}
            >
              <span
                style={{
                  position:
                    "absolute",
                  left: "13px",
                  top: "50%",
                  transform:
                    "translateY(-50%)",
                  color: "#777880",
                }}
              >
                $
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  form.expectedSalePrice
                }
                onChange={(event) =>
                  updateForm(
                    "expectedSalePrice",
                    event.target.value
                  )
                }
                placeholder="0.00"
                style={{
                  ...inputStyle,
                  paddingLeft:
                    "28px",
                }}
              />
            </div>
          </FormField>

          {form.unitType === "BOX" && form.type === "SEALED" && <div className="product-public-controls">
            <div className="product-public-controls__heading">
              <div>
                <strong>Pack breakdown</strong>
                <p>Optional derived-inventory settings. Packs are not catalog Products.</p>
              </div>
              <span>{form.packsPerBox && form.packDisplayName.trim() ? "Configured" : "Not configured"}</span>
            </div>
            <FormField label="Packs per Box" hint="The whole-number pack quantity created by breaking down one Box.">
              <input type="number" min="1" step="1" value={form.packsPerBox}
                onChange={(event) => updateForm("packsPerBox", event.target.value)} placeholder="18" style={inputStyle} />
            </FormField>
            <FormField label="Pack Display Name" hint="The operational name shown in Pack Inventory and Shows.">
              <input value={form.packDisplayName} maxLength={160}
                onChange={(event) => updateForm("packDisplayName", event.target.value)}
                placeholder={form.name ? `${form.name.replace(/\s+Box$/i, "")} Pack` : "Gem 6 Pack"} style={inputStyle} />
            </FormField>
            <FormField label="Default Pack Price" hint="Optional. Used for Pack Inventory opportunity and as the default Show declared value.">
              <input type="number" min="0" step="0.01" value={form.defaultPackPrice}
                onChange={(event) => updateForm("defaultPackPrice", event.target.value)} placeholder="0.00" style={inputStyle} />
            </FormField>
          </div>}

          <FormField
            label="Customer Display Name"
            hint="Optional. The public site uses this name instead of the canonical Product Name."
          >
            <input
              value={form.displayName}
              maxLength={160}
              onChange={(event) =>
                updateForm("displayName", event.target.value)
              }
              placeholder={form.name || "Customer-facing product name"}
              style={inputStyle}
            />
          </FormField>

          <FormField
            label="Short Description"
            hint="Optional customer-facing subtitle shown on storefront cards."
          >
            <input
              value={form.shortDescription}
              maxLength={240}
              onChange={(event) =>
                updateForm("shortDescription", event.target.value)
              }
              placeholder="A concise description for customers"
              style={inputStyle}
            />
          </FormField>

          <div className="product-public-controls">
            <div className="product-public-controls__heading">
              <div>
                <strong>Public catalog</strong>
                <p>Control how this product will appear on the customer site.</p>
              </div>
              <span>{form.publicVisible ? "Visible" : "Hidden"}</span>
            </div>

            <FormField
              label="Public Price"
              hint="Optional. Leave blank to display the Expected Sale Price publicly."
            >
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "13px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#777880",
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.publicPrice}
                  onChange={(event) =>
                    updateForm("publicPrice", event.target.value)
                  }
                  placeholder={form.expectedSalePrice || "0.00"}
                  style={{ ...inputStyle, paddingLeft: "28px" }}
                />
              </div>
            </FormField>

            <div className="product-public-controls__toggles">
              <label>
                <input
                  type="checkbox"
                  checked={form.publicVisible}
                  onChange={(event) =>
                    updateForm("publicVisible", event.target.checked)
                  }
                />
                <span>
                  <strong>Show publicly</strong>
                  <small>Include this product in public inventory.</small>
                </span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(event) =>
                    updateForm("featured", event.target.checked)
                  }
                />
                <span>
                  <strong>Featured product</strong>
                  <small>Mark it for future homepage placement.</small>
                </span>
              </label>
            </div>
          </div>

          {isEditing && product && (
            <div className="product-image-editor">
              <div>
                <strong>Primary product image</strong>
                <p>JPEG, PNG, or WebP up to 8 MB. Used on the customer storefront.</p>
              </div>
              <ProductImageManager
                imageUrl={imageUrl}
                productId={product.id}
                productName={form.displayName.trim() || form.name || product.name}
                onImageChange={(nextImageUrl) => {
                  setImageUrl(nextImageUrl);
                  onImageChanged?.(product.id, nextImageUrl);
                }}
              />
            </div>
          )}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "4px",
              color: "#d0d0d3",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={form.sellable}
              onChange={(event) =>
                updateForm(
                  "sellable",
                  event.target.checked
                )
              }
            />

            Sellable product
          </label>

          <p
            style={{
              margin:
                "6px 0 0 25px",
              color: "#696a71",
              fontSize: "11px",
              lineHeight: 1.5,
            }}
          >
            Turn this off for a
            container or purchase-only
            product that is not sold
            directly.
          </p>
          </>}

          {error && (
            <div
              style={{
                marginTop: "20px",
                padding:
                  "11px 13px",
                border:
                  "1px solid rgba(220, 70, 70, 0.25)",
                borderRadius: "8px",
                background:
                  "rgba(220, 70, 70, 0.08)",
                color: "#e47b7b",
                fontSize: "12px",
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent:
                "flex-end",
              gap: "10px",
              marginTop: "26px",
              paddingTop: "20px",
              borderTop:
                "1px solid #24252a",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="form-field" style={{ marginBottom: "19px" }}>
    <label style={{ display: "block", marginBottom: "7px", color: "#d0d0d3", fontSize: "12px", fontWeight: 650 }}>{label}</label>
    {children}
    {hint && <p style={{ margin: "6px 0 0", color: "#696a71", fontSize: "11px", lineHeight: 1.5 }}>{hint}</p>}
  </div>;
}
