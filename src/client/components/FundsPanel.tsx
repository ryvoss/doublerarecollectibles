import { inputStyle, secondaryButtonStyle } from "./uiStyles";
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

type FundLocation =
  | "CASH"
  | "DIGITAL";

type SinglesLocationChoice =
  | FundLocation
  | "SPLIT";

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
  singlesCashBalance: string | number;
  singlesDigitalBalance: string | number;
  singlesUnallocatedBalance: string | number;
  totalBusinessFunds: string | number;
};

type FundEntry = {
  id: number;
  source: FundSource;
  location: FundLocation | null;
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

  // A single-location entry uses amount.
  amount: string;

  // Singles can also be entered as a Cash + Digital split.
  location: SinglesLocationChoice;
  cashAmount: string;
  digitalAmount: string;

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

type FundsPanelProps = {
  // The Command Center increments this value whenever its quick action
  // should open the existing Add Funds modal in this panel.
  openAddFundsSignal?: number;

  // Lets the parent clear its quick-action state when the modal closes.
  onAddFundsClosed?: () => void;
};

function FundsPanel({
  openAddFundsSignal = 0,
  onAddFundsClosed,
}: FundsPanelProps) {
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

  // Open the same Add Funds modal from the Command Center quick action.
  // Using a numeric signal means the action can be triggered repeatedly.
  useEffect(() => {
    if (openAddFundsSignal > 0) {
      setShowAddFunds(true);
    }
  }, [openAddFundsSignal]);

  function closeAddFunds() {
    setShowAddFunds(false);
    onAddFundsClosed?.();
  }

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
      <section className="panel funds-panel">
        <div
          style={{
            padding: "26px",
          }}
        >
          <span
            className="funds-eyebrow"
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
      <section className="panel funds-panel">
        <div
          style={{
            padding: "26px",
          }}
        >
          <span
            className="funds-eyebrow"
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

  const singlesCashBalance =
    Number(
      summary?.singlesCashBalance ?? 0
    );

  const singlesDigitalBalance =
    Number(
      summary?.singlesDigitalBalance ?? 0
    );

  const singlesUnallocatedBalance =
    Number(
      summary?.singlesUnallocatedBalance ?? 0
    );


  return (
    <>
      <section className="panel funds-panel">
        <div className="panel-header funds-panel-header">
          <div>
            <span className="funds-eyebrow">
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
          className="funds-panel-body"
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
            className="funds-pool-grid"
          >
            <FundBalanceCard
              label="Sealed Funds"
              value={sealedBalance}
              detail="Sale proceeds, purchases and manual entries"
            />

            <FundBalanceCard
              label="Singles Funds"
              value={singlesBalance}
              detail="Cash and Digital breakdown below"
            />
          </div>
          <dl className="funds-location-breakdown" aria-label="Singles fund locations">
            <div><dt>Singles Cash</dt><dd>{money(singlesCashBalance)}</dd></div>
            <div><dt>Singles Digital</dt><dd>{money(singlesDigitalBalance)}</dd></div>
          </dl>
          {singlesUnallocatedBalance !== 0 && <p className="funds-unallocated" role="status">
            Unallocated Singles funds: <strong>{money(singlesUnallocatedBalance)}</strong>. This amount is included in Singles total but has no Cash/Digital location.
          </p>}
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
          onClose={closeAddFunds}
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
      className="funds-balance-card"
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
        className="modal-surface funds-modal"
        style={{
          maxWidth: "760px",
        }}
      >
        <div className="funds-modal-header">
          <div>
            <h2 className="funds-modal-title">
              Funds Activity
            </h2>

            <p
              className="funds-modal-subtitle"
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
              className="funds-empty"
            >
              Loading activity...
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: "24px 16px", border: "1px solid var(--border)", borderRadius: "8px", textAlign: "center",
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
                className="funds-empty"
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
      className="funds-activity-row" style={{borderBottom: last ? "none" : undefined}}
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

          {entry.location && (
            <FundLocationBadge
              location={entry.location}
            />
          )}
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
// FUND LOCATION BADGE
// ---------------------------------------------------------

function FundLocationBadge({
  location,
}: {
  location: FundLocation;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 6px",
        borderRadius: "999px",
        background:
          location === "CASH"
            ? "rgba(88, 169, 111, 0.12)"
            : "rgba(91, 140, 214, 0.12)",
        color:
          location === "CASH"
            ? "#82d591"
            : "#8fb5ec",
        fontSize: "9px",
        fontWeight: 750,
        letterSpacing: "0.05em",
      }}
    >
      {location}
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
    location: "CASH",
    cashAmount: "",
    digitalAmount: "",
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

    const endpoint =
      form.mode ===
      "CONTRIBUTION"
        ? "/api/funds/contributions"
        : "/api/funds/adjustments";

    // Build one or two ledger entries.
    //
    // A normal Cash or Digital selection creates one entry.
    // "Split" creates separate Cash and Digital entries so both
    // balances remain independently traceable in the ledger.
    const entriesToCreate: Array<{
      amount: number;
      location?: FundLocation;
    }> = [];

    if (form.source === "SEALED") {
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

      entriesToCreate.push({
        amount,
      });
    } else if (
      form.location === "SPLIT"
    ) {
      const cashAmount =
        Number(form.cashAmount || 0);

      const digitalAmount =
        Number(form.digitalAmount || 0);

      if (
        !Number.isFinite(cashAmount) ||
        !Number.isFinite(digitalAmount)
      ) {
        setError(
          "Enter valid Cash and Digital amounts."
        );

        return;
      }

      if (
        form.mode ===
        "CONTRIBUTION"
      ) {
        if (
          cashAmount < 0 ||
          digitalAmount < 0 ||
          cashAmount +
            digitalAmount <=
            0
        ) {
          setError(
            "A split contribution must contain a positive Cash or Digital amount."
          );

          return;
        }
      } else if (
        cashAmount === 0 &&
        digitalAmount === 0
      ) {
        setError(
          "Enter a non-zero Cash or Digital adjustment."
        );

        return;
      }

      if (cashAmount !== 0) {
        entriesToCreate.push({
          amount: cashAmount,
          location: "CASH",
        });
      }

      if (digitalAmount !== 0) {
        entriesToCreate.push({
          amount: digitalAmount,
          location: "DIGITAL",
        });
      }
    } else {
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

      entriesToCreate.push({
        amount,
        location: form.location,
      });
    }

    try {
      setSaving(true);
      setError(null);

      const requestBody =
        form.source === "SINGLES" &&
        form.location === "SPLIT"
          ? {
              source: form.source,
              allocations:
                entriesToCreate.map(
                  (entry) => ({
                    location:
                      entry.location,
                    amount:
                      entry.amount,
                  })
                ),
              transactionDate:
                form.transactionDate,
              note:
                form.note.trim() ||
                undefined,
            }
          : {
              source: form.source,
              location:
                entriesToCreate[0]
                  ?.location,
              amount:
                entriesToCreate[0]
                  ?.amount,
              transactionDate:
                form.transactionDate,
              note:
                form.note.trim() ||
                undefined,
            };

      // Split Singles contributions/adjustments now use one API call.
      // The backend saves both location entries in one transaction, so
      // Cash and Digital either both succeed or neither is recorded.
      const response =
        await fetch(endpoint, {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            requestBody
          ),
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

      window.dispatchEvent(
        new Event(
          "business-data-changed"
        )
      );

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
      className="modal-backdrop"
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
        className="modal-surface funds-modal"
        style={{
          maxWidth: "520px",
        }}
      >
        <div className="funds-modal-header">
          <div>
            <h2 className="funds-modal-title">
              Add Funds
            </h2>

            <p
              className="funds-modal-subtitle"
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
                  setForm((current) => ({
                    ...current,
                    source: "SEALED",
                    amount: "",
                    cashAmount: "",
                    digitalAmount: "",
                  }))
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
                  setForm((current) => ({
                    ...current,
                    source: "SINGLES",
                    location: "CASH",
                    amount: "",
                    cashAmount: "",
                    digitalAmount: "",
                  }))
                }
              >
                Singles
              </ChoiceButton>
            </div>
          </FormField>

          {form.source === "SINGLES" && (
            <FormField
              label="Fund Location"
              hint="Choose where the Singles money is held. Use Split when one entry contains both Cash and Digital."
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3, minmax(0, 1fr))",
                  gap: "8px",
                }}
              >
                <ChoiceButton
                  active={
                    form.location ===
                    "CASH"
                  }
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      location: "CASH",
                      cashAmount: "",
                      digitalAmount: "",
                    }))
                  }
                >
                  Cash
                </ChoiceButton>

                <ChoiceButton
                  active={
                    form.location ===
                    "DIGITAL"
                  }
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      location:
                        "DIGITAL",
                      cashAmount: "",
                      digitalAmount: "",
                    }))
                  }
                >
                  Digital
                </ChoiceButton>

                <ChoiceButton
                  active={
                    form.location ===
                    "SPLIT"
                  }
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      location: "SPLIT",
                      amount: "",
                    }))
                  }
                >
                  Split
                </ChoiceButton>
              </div>
            </FormField>
          )}

          {form.source === "SINGLES" &&
          form.location === "SPLIT" ? (
            <FormField
              label="Split Amount"
              hint={
                form.mode ===
                "ADJUSTMENT"
                  ? "Enter the signed Cash and Digital corrections separately."
                  : "Enter how much of this contribution is Cash and how much is Digital."
              }
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: "10px",
                }}
              >
                <MoneyInput
                  label="Cash"
                  value={
                    form.cashAmount
                  }
                  onChange={(value) =>
                    updateForm(
                      "cashAmount",
                      value
                    )
                  }
                />

                <MoneyInput
                  label="Digital"
                  value={
                    form.digitalAmount
                  }
                  onChange={(value) =>
                    updateForm(
                      "digitalAmount",
                      value
                    )
                  }
                />
              </div>

              <div
                style={{
                  marginTop: "10px",
                  padding: "10px 12px",
                  border:
                    "1px solid #292a30",
                  borderRadius: "8px",
                  background: "#111216",
                  color: "#a8a9ae",
                  fontSize: "12px",
                }}
              >
                Total:{" "}
                <strong
                  style={{
                    color: "#e5e5e7",
                  }}
                >
                  {money(
                    Number(
                      form.cashAmount ||
                        0
                    ) +
                      Number(
                        form.digitalAmount ||
                          0
                      )
                  )}
                </strong>
              </div>
            </FormField>
          ) : (
            <FormField
              label="Amount"
              hint={
                form.mode ===
                "ADJUSTMENT"
                  ? "Use a positive amount to add money or a negative amount to remove money."
                  : form.source ===
                      "SINGLES"
                    ? `This amount will be added to Singles ${form.location === "CASH" ? "Cash" : "Digital"}.`
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
          )}

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
// MONEY INPUT
// ---------------------------------------------------------

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <span
        style={{
          display: "block",
          marginBottom: "6px",
          color: "#777880",
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>

      <div
        style={{
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
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
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder="0.00"
          style={{
            ...inputStyle,
            paddingLeft: "28px",
          }}
        />
      </div>
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
      className={active ? "funds-choice is-active" : "funds-choice"}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------
// STYLES
// ---------------------------------------------------------









const closeButtonStyle = {
  border: 0,
  background:
    "transparent",
  color: "#777880",
  cursor: "pointer",
  fontSize: "20px",
};





export default FundsPanel;
