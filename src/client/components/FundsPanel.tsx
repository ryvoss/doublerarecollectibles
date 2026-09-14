import {
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
  ReactNode,
} from "react";

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------

type FundSource =
  | "SEALED"
  | "SINGLES";

type FundEntryType =
  | "OPENING_BALANCE"
  | "SEALED_SALE"
  | "ORDER_PURCHASE"
  | "SINGLES_SHOW_GAIN"
  | "PERSONAL_CONTRIBUTION"
  | "MANUAL_ADJUSTMENT";

type FundsSummary = {
  sealedBalance: string | number;
  singlesBalance: string | number;
  totalBusinessFunds: string | number;
};

type FundEntry = {
  id: number;
  source: FundSource;
  type: FundEntryType;
  amount: string | number;
  transactionDate: string;
  note: string | null;
  createdAt: string;

  sale: {
    id: number;
    saleNumber: string;
  } | null;

  order: {
    id: number;
    orderNumber: string;
  } | null;

  showVisit: {
    id: number;
    visitDate: string;

    show: {
      id: number;
      name: string;
    };
  } | null;
};

type ManualEntryMode =
  | "CONTRIBUTION"
  | "ADJUSTMENT";

type AddFundsForm = {
  mode: ManualEntryMode;
  source: FundSource;
  amount: string;
  transactionDate: string;
  note: string;
};

// ---------------------------------------------------------
// FORMATTERS
// ---------------------------------------------------------

function money(
  value:
    | string
    | number
    | null
    | undefined
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    }
  ).format(Number(value ?? 0));
}

function formatDate(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  ).format(date);
}

function todayForInput() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getEntryLabel(
  entry: FundEntry
) {
  switch (entry.type) {
    case "OPENING_BALANCE":
      return "Opening Balance";

    case "SEALED_SALE":
      return entry.sale
        ? `Sealed Sale ${entry.sale.saleNumber}`
        : "Sealed Sale";

    case "ORDER_PURCHASE":
      return entry.order
        ? `Inventory Order ${entry.order.orderNumber}`
        : "Inventory Order";

    case "SINGLES_SHOW_GAIN":
      return entry.showVisit
        ? `Singles Gain · ${entry.showVisit.show.name}`
        : "Singles Show Gain";

    case "PERSONAL_CONTRIBUTION":
      return "Personal Contribution";

    case "MANUAL_ADJUSTMENT":
      return "Manual Adjustment";
  }
}

// ---------------------------------------------------------
// FUNDS PANEL
// ---------------------------------------------------------

function FundsPanel() {
  const [
    summary,
    setSummary,
  ] = useState<FundsSummary | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    showActivity,
    setShowActivity,
  ] = useState(false);

  const [
    showAddFunds,
    setShowAddFunds,
  ] = useState(false);

  const [
    entries,
    setEntries,
  ] = useState<FundEntry[]>([]);

  const [
    entriesLoading,
    setEntriesLoading,
  ] = useState(false);

  const [
    entriesError,
    setEntriesError,
  ] = useState<string | null>(
    null
  );

  // -------------------------------------------------------
  // LOAD CURRENT BALANCES
  // -------------------------------------------------------

  async function loadSummary() {
    try {
      setError(null);

      const response =
        await fetch(
          "/api/funds/summary"
        );

      if (!response.ok) {
        throw new Error(
          "Funds could not be loaded."
        );
      }

      const data =
        await response.json();

      setSummary(data);
    } catch (error) {
      console.error(
        "Funds summary loading error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Funds could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------
  // LOAD FUND ACTIVITY
  // -------------------------------------------------------

  async function loadEntries() {
    try {
      setEntriesLoading(true);
      setEntriesError(null);

      const response =
        await fetch(
          "/api/funds/entries"
        );

      if (!response.ok) {
        throw new Error(
          "Fund activity could not be loaded."
        );
      }

      const data =
        await response.json();

      setEntries(data);
    } catch (error) {
      console.error(
        "Fund activity loading error:",
        error
      );

      setEntriesError(
        error instanceof Error
          ? error.message
          : "Fund activity could not be loaded."
      );
    } finally {
      setEntriesLoading(false);
    }
  }

  useEffect(() => {
    // Load the balances when the dashboard first opens.
    void loadSummary();

    // Other parts of the app dispatch this event after business data
    // changes, such as recording a sale or finalizing a Show Visit.
    // Listening here keeps the funds cards and open activity modal
    // current without requiring a manual browser refresh.
    function refreshFundsFromBusinessChange() {
      void loadSummary();

      if (showActivity) {
        void loadEntries();
      }
    }

    window.addEventListener(
      "business-data-changed",
      refreshFundsFromBusinessChange
    );

    return () => {
      window.removeEventListener(
        "business-data-changed",
        refreshFundsFromBusinessChange
      );
    };
  }, [showActivity]);

  // -------------------------------------------------------
  // OPEN ACTIVITY MODAL
  // -------------------------------------------------------

  async function openActivity() {
    setShowActivity(true);

    await loadEntries();
  }

  // -------------------------------------------------------
  // REFRESH AFTER A MANUAL ENTRY
  // -------------------------------------------------------

  async function handleFundsChanged() {
    await loadSummary();

    // If activity has already been opened,
    // keep its data current too.
    if (showActivity) {
      await loadEntries();
    }
  }

  // -------------------------------------------------------
  // LOADING STATE
  // -------------------------------------------------------

  if (loading) {
    return (
      <section style={panelStyle}>
        <div
          style={{
            padding: "26px",
          }}
        >
          <span
            style={eyebrowStyle}
          >
            AVAILABLE BUSINESS FUNDS
          </span>

          <div
            style={{
              marginTop: "14px",
              color: "#777880",
              fontSize: "13px",
            }}
          >
            Loading funds...
          </div>
        </div>
      </section>
    );
  }

  // -------------------------------------------------------
  // ERROR STATE
  // -------------------------------------------------------

  if (error) {
    return (
      <section style={panelStyle}>
        <div
          style={{
            padding: "26px",
          }}
        >
          <span
            style={eyebrowStyle}
          >
            AVAILABLE BUSINESS FUNDS
          </span>

          <div
            style={{
              marginTop: "14px",
              color: "#e47b7b",
              fontSize: "13px",
            }}
          >
            {error}
          </div>

          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadSummary();
            }}
            style={{
              ...secondaryButtonStyle,
              marginTop: "16px",
            }}
          >
            Try Again
          </button>
        </div>
      </section>
    );
  }

  const totalBusinessFunds =
    Number(
      summary?.totalBusinessFunds ??
        0
    );

  const sealedBalance =
    Number(
      summary?.sealedBalance ?? 0
    );

  const singlesBalance =
    Number(
      summary?.singlesBalance ?? 0
    );

  return (
    <>
      <section style={panelStyle}>
        <div style={panelHeaderStyle}>
          <div>
            <span style={eyebrowStyle}>
              AVAILABLE BUSINESS FUNDS
            </span>

            <p
              style={{
                margin:
                  "6px 0 0",
                color: "#777880",
                fontSize: "12px",
              }}
            >
              Current money available
              across Sealed and Singles.
            </p>
          </div>

          <button
            type="button"
            onClick={openActivity}
            style={secondaryButtonStyle}
          >
            View Activity
          </button>
        </div>

        <div
          style={{
            padding:
              "30px 28px 26px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems:
                "flex-end",
              justifyContent:
                "space-between",
              gap: "24px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <span
                style={{
                  display: "block",
                  color: "#777880",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing:
                    "0.08em",
                  textTransform:
                    "uppercase",
                }}
              >
                Total Available
              </span>

              <strong
                style={{
                  display: "block",
                  marginTop: "5px",
                  color:
                    totalBusinessFunds >=
                    0
                      ? "#f0f0f2"
                      : "#e47b7b",
                  fontSize:
                    "34px",
                  lineHeight: 1.1,
                  fontWeight: 750,
                  letterSpacing:
                    "-0.03em",
                }}
              >
                {money(
                  totalBusinessFunds
                )}
              </strong>
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={() =>
                setShowAddFunds(true)
              }
            >
              + Add Funds
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: "12px",
              marginTop: "26px",
            }}
          >
            <FundBalanceCard
              label="Sealed Funds"
              value={sealedBalance}
              detail="Sales minus inventory purchases"
            />

            <FundBalanceCard
              label="Singles Funds"
              value={singlesBalance}
              detail="Show gains and contributions"
            />
          </div>
        </div>
      </section>

      {showActivity && (
        <FundsActivityModal
          summary={summary}
          entries={entries}
          loading={entriesLoading}
          error={entriesError}
          onClose={() =>
            setShowActivity(false)
          }
          onAddFunds={() => {
            setShowActivity(false);
            setShowAddFunds(true);
          }}
        />
      )}

      {showAddFunds && (
        <AddFundsModal
          onClose={() =>
            setShowAddFunds(false)
          }
          onSaved={
            handleFundsChanged
          }
        />
      )}
    </>
  );
}

// ---------------------------------------------------------
// BALANCE CARD
// ---------------------------------------------------------

function FundBalanceCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div
      style={{
        padding: "18px",
        border:
          "1px solid #292a30",
        borderRadius: "10px",
        background: "#121317",
      }}
    >
      <span
        style={{
          display: "block",
          color: "#777880",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing:
            "0.06em",
          textTransform:
            "uppercase",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: "block",
          marginTop: "7px",
          color:
            value >= 0
              ? "#dedee1"
              : "#e47b7b",
          fontSize: "21px",
          fontWeight: 700,
        }}
      >
        {money(value)}
      </strong>

      <span
        style={{
          display: "block",
          marginTop: "5px",
          color: "#696a71",
          fontSize: "11px",
        }}
      >
        {detail}
      </span>
    </div>
  );
}

// ---------------------------------------------------------
// FUNDS ACTIVITY MODAL
// ---------------------------------------------------------

function FundsActivityModal({
  summary,
  entries,
  loading,
  error,
  onClose,
  onAddFunds,
}: {
  summary: FundsSummary | null;
  entries: FundEntry[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onAddFunds: () => void;
}) {
  return (
    <div
      style={modalBackdropStyle}
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
        style={{
          ...modalStyle,
          maxWidth: "760px",
        }}
      >
        <div style={modalHeaderStyle}>
          <div>
            <h2 style={modalTitleStyle}>
              Funds Activity
            </h2>

            <p
              style={
                modalSubtitleStyle
              }
            >
              Money moving into and
              out of the business.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close funds activity"
            style={closeButtonStyle}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: "22px 24px",
            borderBottom:
              "1px solid #24252a",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(3, minmax(0, 1fr))",
              gap: "10px",
            }}
          >
            <ModalBalance
              label="Total"
              value={
                summary
                  ?.totalBusinessFunds
              }
            />

            <ModalBalance
              label="Sealed"
              value={
                summary
                  ?.sealedBalance
              }
            />

            <ModalBalance
              label="Singles"
              value={
                summary
                  ?.singlesBalance
              }
            />
          </div>
        </div>

        <div
          style={{
            padding: "22px 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent:
                "space-between",
              gap: "16px",
              marginBottom: "14px",
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  color: "#e5e5e7",
                  fontSize: "14px",
                }}
              >
                Recent Activity
              </h3>

              <p
                style={{
                  margin:
                    "4px 0 0",
                  color: "#696a71",
                  fontSize: "11px",
                }}
              >
                Newest transactions
                first
              </p>
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={onAddFunds}
            >
              + Add Funds
            </button>
          </div>

          {loading && (
            <div
              style={
                emptyActivityStyle
              }
            >
              Loading activity...
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                ...emptyActivityStyle,
                color: "#e47b7b",
              }}
            >
              {error}
            </div>
          )}

          {!loading &&
            !error &&
            entries.length === 0 && (
              <div
                style={
                  emptyActivityStyle
                }
              >
                No fund activity has
                been recorded yet.
              </div>
            )}

          {!loading &&
            !error &&
            entries.length > 0 && (
              <div
                style={{
                  border:
                    "1px solid #292a30",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                {entries.map(
                  (
                    entry,
                    index
                  ) => (
                    <FundActivityRow
                      key={entry.id}
                      entry={entry}
                      last={
                        index ===
                        entries.length -
                          1
                      }
                    />
                  )
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// ACTIVITY ROW
// ---------------------------------------------------------

function FundActivityRow({
  entry,
  last,
}: {
  entry: FundEntry;
  last: boolean;
}) {
  const amount =
    Number(entry.amount);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "18px",
        padding: "14px 16px",
        borderBottom: last
          ? "none"
          : "1px solid #24252a",
        background: "#131419",
      }}
    >
      <div
        style={{
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <strong
            style={{
              color: "#d8d8db",
              fontSize: "12px",
              fontWeight: 650,
            }}
          >
            {getEntryLabel(entry)}
          </strong>

          <FundSourceBadge
            source={entry.source}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginTop: "5px",
            color: "#696a71",
            fontSize: "11px",
          }}
        >
          <span>
            {formatDate(
              entry.transactionDate
            )}
          </span>

          {entry.note && (
            <>
              <span>·</span>
              <span>
                {entry.note}
              </span>
            </>
          )}
        </div>
      </div>

      <strong
        style={{
          color:
            amount >= 0
              ? "#66c878"
              : "#e47b7b",
          fontSize: "13px",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {amount >= 0 ? "+" : ""}
        {money(amount)}
      </strong>
    </div>
  );
}

// ---------------------------------------------------------
// FUND SOURCE BADGE
// ---------------------------------------------------------

function FundSourceBadge({
  source,
}: {
  source: FundSource;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 6px",
        borderRadius: "999px",
        background:
          source === "SEALED"
            ? "rgba(85, 135, 220, 0.12)"
            : "rgba(178, 111, 214, 0.12)",
        color:
          source === "SEALED"
            ? "#82a9e8"
            : "#c192dc",
        fontSize: "9px",
        fontWeight: 750,
        letterSpacing:
          "0.05em",
      }}
    >
      {source}
    </span>
  );
}

// ---------------------------------------------------------
// MODAL BALANCE
// ---------------------------------------------------------

function ModalBalance({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number
    | null
    | undefined;
}) {
  return (
    <div
      style={{
        padding: "14px",
        border:
          "1px solid #292a30",
        borderRadius: "9px",
        background: "#111216",
      }}
    >
      <span
        style={{
          color: "#696a71",
          fontSize: "10px",
          fontWeight: 700,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.07em",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: "block",
          marginTop: "5px",
          color: "#e5e5e7",
          fontSize: "17px",
        }}
      >
        {money(value)}
      </strong>
    </div>
  );
}

// ---------------------------------------------------------
// ADD FUNDS MODAL
// ---------------------------------------------------------

function AddFundsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [
    form,
    setForm,
  ] = useState<AddFundsForm>({
    mode: "CONTRIBUTION",
    source: "SEALED",
    amount: "",
    transactionDate:
      todayForInput(),
    note: "",
  });

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  function updateForm<
    K extends keyof AddFundsForm,
  >(
    field: K,
    value: AddFundsForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const amount =
      Number(form.amount);

    if (
      !Number.isFinite(amount) ||
      amount === 0
    ) {
      setError(
        "Enter a valid non-zero amount."
      );

      return;
    }

    if (
      form.mode ===
        "CONTRIBUTION" &&
      amount <= 0
    ) {
      setError(
        "A personal contribution must be greater than zero."
      );

      return;
    }

    if (
      form.mode ===
        "ADJUSTMENT" &&
      !form.note.trim()
    ) {
      setError(
        "Manual adjustments require a note explaining the correction."
      );

      return;
    }

    try {
      setSaving(true);
      setError(null);

      const endpoint =
        form.mode ===
        "CONTRIBUTION"
          ? "/api/funds/contributions"
          : "/api/funds/adjustments";

      const response =
        await fetch(endpoint, {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            source: form.source,
            amount,

            transactionDate:
              form.transactionDate,

            note:
              form.note.trim() ||
              undefined,
          }),
        });

      if (!response.ok) {
        const responseBody =
          await response
            .json()
            .catch(() => null);

        throw new Error(
          responseBody?.error ??
            "Funds could not be updated."
        );
      }

      await onSaved();

      onClose();
    } catch (error) {
      console.error(
        "Manual fund entry error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Funds could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={modalBackdropStyle}
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget &&
          !saving
        ) {
          onClose();
        }
      }}
    >
      <div
        style={{
          ...modalStyle,
          maxWidth: "520px",
        }}
      >
        <div style={modalHeaderStyle}>
          <div>
            <h2 style={modalTitleStyle}>
              Add Funds
            </h2>

            <p
              style={
                modalSubtitleStyle
              }
            >
              Record money added
              manually to Sealed or
              Singles.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close add funds"
            style={closeButtonStyle}
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            padding: "24px",
          }}
        >
          <FormField
            label="Entry Type"
            hint="Contributions add personal money. Adjustments correct a recorded balance."
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "8px",
              }}
            >
              <ChoiceButton
                active={
                  form.mode ===
                  "CONTRIBUTION"
                }
                onClick={() =>
                  updateForm(
                    "mode",
                    "CONTRIBUTION"
                  )
                }
              >
                Personal Contribution
              </ChoiceButton>

              <ChoiceButton
                active={
                  form.mode ===
                  "ADJUSTMENT"
                }
                onClick={() =>
                  updateForm(
                    "mode",
                    "ADJUSTMENT"
                  )
                }
              >
                Adjustment
              </ChoiceButton>
            </div>
          </FormField>

          <FormField
            label="Fund"
            hint="Choose which side of the business owns this money."
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "8px",
              }}
            >
              <ChoiceButton
                active={
                  form.source ===
                  "SEALED"
                }
                onClick={() =>
                  updateForm(
                    "source",
                    "SEALED"
                  )
                }
              >
                Sealed
              </ChoiceButton>

              <ChoiceButton
                active={
                  form.source ===
                  "SINGLES"
                }
                onClick={() =>
                  updateForm(
                    "source",
                    "SINGLES"
                  )
                }
              >
                Singles
              </ChoiceButton>
            </div>
          </FormField>

          <FormField
            label="Amount"
            hint={
              form.mode ===
              "ADJUSTMENT"
                ? "Use a positive amount to add money or a negative amount to remove money."
                : "Enter the amount of personal money being added."
            }
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
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  updateForm(
                    "amount",
                    event.target
                      .value
                  )
                }
                placeholder="0.00"
                autoFocus
                style={{
                  ...inputStyle,
                  paddingLeft:
                    "28px",
                }}
              />
            </div>
          </FormField>

          <FormField label="Date">
            <input
              type="date"
              value={
                form.transactionDate
              }
              onChange={(event) =>
                updateForm(
                  "transactionDate",
                  event.target.value
                )
              }
              style={inputStyle}
            />
          </FormField>

          <FormField
            label={
              form.mode ===
              "ADJUSTMENT"
                ? "Note"
                : "Note (Optional)"
            }
            hint={
              form.mode ===
              "ADJUSTMENT"
                ? "A reason is required so the correction remains auditable."
                : "Optional description of where the contribution came from."
            }
          >
            <textarea
              value={form.note}
              onChange={(event) =>
                updateForm(
                  "note",
                  event.target.value
                )
              }
              rows={3}
              placeholder={
                form.mode ===
                "ADJUSTMENT"
                  ? "Explain the correction..."
                  : "Optional note..."
              }
              style={{
                ...inputStyle,
                resize:
                  "vertical",
              }}
            />
          </FormField>

          {error && (
            <div
              style={{
                marginTop: "4px",
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
              marginTop: "24px",
              paddingTop: "20px",
              borderTop:
                "1px solid #24252a",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={
                secondaryButtonStyle
              }
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
                : form.mode ===
                    "CONTRIBUTION"
                  ? "Add Funds"
                  : "Save Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// FORM FIELD
// ---------------------------------------------------------

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: "19px",
      }}
    >
      <label
        style={{
          display: "block",
          marginBottom: "7px",
          color: "#d0d0d3",
          fontSize: "12px",
          fontWeight: 650,
        }}
      >
        {label}
      </label>

      {children}

      {hint && (
        <p
          style={{
            margin: "6px 0 0",
            color: "#696a71",
            fontSize: "11px",
            lineHeight: 1.5,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// CHOICE BUTTON
// ---------------------------------------------------------

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 12px",
        border: active
          ? "1px solid #a93636"
          : "1px solid #303137",
        borderRadius: "8px",
        background: active
          ? "rgba(169, 54, 54, 0.12)"
          : "#101115",
        color: active
          ? "#ececef"
          : "#8c8d94",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: active
          ? 700
          : 600,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------
// STYLES
// ---------------------------------------------------------

const panelStyle = {
  width: "100%",
  boxSizing:
    "border-box" as const,
  marginBottom: "18px",
  border:
    "1px solid #292a30",
  borderRadius: "12px",
  background: "#17181c",
  overflow: "hidden",
};

const panelHeaderStyle = {
  display: "flex",
  alignItems:
    "center" as const,
  justifyContent:
    "space-between" as const,
  gap: "20px",
  padding: "18px 24px",
  borderBottom:
    "1px solid #24252a",
};

const eyebrowStyle = {
  color: "#85868d",
  fontSize: "10px",
  fontWeight: 750,
  letterSpacing: "0.1em",
};

const modalBackdropStyle = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems:
    "center" as const,
  justifyContent:
    "center" as const,
  padding: "24px",
  background:
    "rgba(0, 0, 0, 0.72)",
  backdropFilter: "blur(4px)",
};

const modalStyle = {
  width: "100%",
  maxHeight: "88vh",
  overflowY:
    "auto" as const,
  border:
    "1px solid #2b2c31",
  borderRadius: "14px",
  background: "#17181c",
  boxShadow:
    "0 24px 70px rgba(0, 0, 0, 0.45)",
};

const modalHeaderStyle = {
  display: "flex",
  alignItems:
    "flex-start" as const,
  justifyContent:
    "space-between" as const,
  gap: "20px",
  padding: "22px 24px",
  borderBottom:
    "1px solid #24252a",
};

const modalTitleStyle = {
  margin: 0,
  color: "#e5e5e7",
  fontSize: "18px",
};

const modalSubtitleStyle = {
  margin: "6px 0 0",
  color: "#777880",
  fontSize: "12px",
};

const closeButtonStyle = {
  border: 0,
  background:
    "transparent",
  color: "#777880",
  cursor: "pointer",
  fontSize: "20px",
};

const secondaryButtonStyle = {
  boxSizing:
    "border-box" as const,
  padding: "9px 13px",
  border:
    "1px solid #303137",
  borderRadius: "8px",
  background: "#1d1e23",
  color: "#b8b8bd",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 650,
  whiteSpace:
    "nowrap" as const,
};

const inputStyle = {
  width: "100%",
  boxSizing:
    "border-box" as const,
  padding: "11px 12px",
  border:
    "1px solid #303137",
  borderRadius: "8px",
  outline: "none",
  background: "#101115",
  color: "#e5e5e7",
  fontSize: "13px",
};

const emptyActivityStyle = {
  padding: "30px 16px",
  border:
    "1px solid #292a30",
  borderRadius: "10px",
  background: "#131419",
  color: "#777880",
  fontSize: "12px",
  textAlign:
    "center" as const,
};

export default FundsPanel;