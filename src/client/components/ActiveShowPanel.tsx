import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
  ReactNode,
} from "react";

import SalesPage from "../pages/SalesPage";

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------

type ShowVisitStatus =
  | "PLANNED"
  | "ACTIVE"
  | "FINALIZED";

type ShowVisit = {
  id: number;
  showId: number;
  visitDate: string;
  status: ShowVisitStatus;
  startedAt: string | null;

  startingSinglesValue: string;
  endingSinglesValue: string | null;

  startingCash: string;
  endingCash: string | null;

  startingDigital: string;
  endingDigital: string | null;

  notes: string | null;

  finalizedAt: string | null;

  show: {
    id: number;
    name: string;
    active: boolean;
  };
};

type ShowListVisit = {
  id: number;
  showId: number;
  visitDate: string;
  status: ShowVisitStatus;
  finalizedAt: string | null;
};

type Show = {
  id: number;
  name: string;
  active: boolean;
  notes: string | null;
  visits: ShowListVisit[];
};

type ActiveVisitResponse = {
  activeVisit: ShowVisit | null;
};

type FundsSummary = {
  sealedBalance: string | number;
  singlesBalance: string | number;
  singlesCashBalance: string | number;
  singlesDigitalBalance: string | number;
  singlesUnallocatedBalance: string | number;
  totalBusinessFunds: string | number;
};

type VisitPerformance = {
  visit: {
    visitId: number;
    showId: number;
    showName: string;
    visitDate: string;
    status?: ShowVisitStatus;
    startedAt?: string | null;
    finalized: boolean;
    finalizedAt: string | null;
    provisional: boolean;
  };

  singles: {
    startingInventoryValue: string;
    endingInventoryValue: string | null;
    inventoryGrowth: string | null;
  };

  funds: {
    startingCash: string;
    endingCash: string | null;
    cashChange: string | null;

    startingDigital: string;
    endingDigital: string | null;
    digitalChange: string | null;

    startingLiquidFunds: string;
    endingLiquidFunds: string | null;
    liquidFundsChange: string | null;
  };

  position: {
    startingTotalPosition: string;
    endingTotalPosition: string | null;
    totalPositionGrowth: string | null;
    isProfit: false;
  };

  sealed: {
    salesTransactions: number;
    unitsSold: number;
    revenue: string;
    cashRevenue: string;
    digitalRevenue: string;
    cogs: string;
    grossProfit: string;
    grossMargin: number;
  };
};

type VisitDetail = ShowVisit & {
  sales: {
    id: number;
    saleNumber: string;
    saleDate: string;
    paymentMethod: "CASH" | "DIGITAL";
    notes: string | null;

    lines: {
      id: number;
      quantity: number;
      unitSalePrice: string;
      revenue: string;
      cogs: string;
      grossProfit: string;

      product: {
        id: number;
        name: string;
        itemId: string;
      };
    }[];
  }[];
};

type StartVisitForm = {
  showId: string;
  visitDate: string;
  startingSinglesValue: string;
  startingCash: string;
  startingDigital: string;
};

type EndingSnapshotForm = {
  endingSinglesValue: string;
  endingCash: string;
  endingDigital: string;
};

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

function money(
  value:
    | string
    | number
    | null
    | undefined
): string {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue)) {
    return "$0.00";
  }

  return numberValue.toLocaleString(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    }
  );
}

function percent(
  value:
    | string
    | number
    | null
    | undefined
): string {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue)) {
    return "0.0%";
  }

  return `${(numberValue * 100).toFixed(1)}%`;
}

function formatDate(
  value: string | null | undefined
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );
}

function dateInputValue(
  value: string
): string {
  return value.slice(0, 10);
}

function todayInputValue(): string {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isValidMoneyInput(
  value: string
): boolean {
  if (value.trim() === "") {
    return false;
  }

  const numberValue = Number(value);

  return (
    Number.isFinite(numberValue) &&
    numberValue >= 0
  );
}

function moneyInputToCents(
  value: string
): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.round(numberValue * 100);
}

async function readApiError(
  response: Response,
  fallback: string
): Promise<string> {
  const body = await response
    .json()
    .catch(() => null);

  return body?.error ?? fallback;
}

// ---------------------------------------------------------
// CROSS-PAGE REFRESH SIGNAL
// ---------------------------------------------------------

// The Dashboard is made from several independent components. Dispatching
// this event lets those components reload themselves after a Show action
// changes shared data such as Funds, Sales, Inventory, or Show history.
function notifyBusinessDataChanged() {
  window.dispatchEvent(
    new Event("business-data-changed")
  );
}

// ---------------------------------------------------------
// ACTIVE SHOW PANEL
// ---------------------------------------------------------

export default function ActiveShowPanel() {
  const [activeVisit, setActiveVisit] =
    useState<ShowVisit | null>(null);

  const [shows, setShows] =
    useState<Show[]>([]);

  const [performance, setPerformance] =
    useState<VisitPerformance | null>(
      null
    );

  const [visitDetail, setVisitDetail] =
    useState<VisitDetail | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [showStartModal, setShowStartModal] =
    useState(false);

  const [showVisitModal, setShowVisitModal] =
    useState(false);

  const [showEndForm, setShowEndForm] =
    useState(false);

  const [showReview, setShowReview] =
    useState(false);

  // -------------------------------------------------------
  // LOAD ACTIVE VISIT
  // -------------------------------------------------------

  const loadActiveVisit =
    useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          "/api/shows/active-visit"
        );

        if (!response.ok) {
          throw new Error(
            await readApiError(
              response,
              "Active show visit could not be loaded."
            )
          );
        }

        const data =
          (await response.json()) as ActiveVisitResponse;

        setActiveVisit(
          data.activeVisit
        );
      } catch (error) {
        console.error(
          "Active show visit loading error:",
          error
        );

        setError(
          error instanceof Error
            ? error.message
            : "Active show visit could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadActiveVisit();
  }, [loadActiveVisit]);

  // -------------------------------------------------------
  // LOAD SHOW LIST
  // -------------------------------------------------------

  async function loadShows() {
    try {
      const response = await fetch(
        "/api/shows"
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            "Shows could not be loaded."
          )
        );
      }

      const data =
        (await response.json()) as Show[];

      setShows(data);
    } catch (error) {
      console.error(
        "Show loading error:",
        error
      );

      throw error;
    }
  }

  // -------------------------------------------------------
  // LOAD ACTIVE VISIT DETAILS
  // -------------------------------------------------------

  async function loadVisitWorkspace(
    visitId: number
  ) {
    try {
      setError(null);

      const [
        performanceResponse,
        visitResponse,
      ] = await Promise.all([
        fetch(
          `/api/shows/visits/${visitId}/performance`
        ),

        fetch(
          `/api/shows/visits/${visitId}`
        ),
      ]);

      if (!performanceResponse.ok) {
        throw new Error(
          await readApiError(
            performanceResponse,
            "Show performance could not be loaded."
          )
        );
      }

      if (!visitResponse.ok) {
        throw new Error(
          await readApiError(
            visitResponse,
            "Show visit could not be loaded."
          )
        );
      }

      const performanceData =
        (await performanceResponse.json()) as VisitPerformance;

      const visitData =
        (await visitResponse.json()) as VisitDetail;

      setPerformance(
        performanceData
      );

      setVisitDetail(
        visitData
      );
    } catch (error) {
      console.error(
        "Show visit workspace loading error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Show visit could not be loaded."
      );
    }
  }

  // -------------------------------------------------------
  // OPEN START VISIT
  // -------------------------------------------------------

  async function openStartVisit() {
    try {
      setError(null);

      await loadShows();

      setShowStartModal(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Shows could not be loaded."
      );
    }
  }

  // -------------------------------------------------------
  // OPEN ACTIVE VISIT
  // -------------------------------------------------------

  async function openActiveVisit() {
    if (!activeVisit) {
      return;
    }

    await loadVisitWorkspace(
      activeVisit.id
    );

    setShowEndForm(false);
    setShowReview(false);
    setShowVisitModal(true);
  }

  // -------------------------------------------------------
  // AFTER FINALIZE
  // -------------------------------------------------------

  async function handleVisitFinalized() {
    setShowVisitModal(false);
    setShowEndForm(false);
    setShowReview(false);
    setPerformance(null);
    setVisitDetail(null);

    // The active visit disappears immediately after finalization.
    await loadActiveVisit();

    // Finalizing a Show can change the Singles Funds balance and Show
    // history, so let the rest of the dashboard refresh without requiring
    // a browser reload.
    notifyBusinessDataChanged();
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------

  return (
    <>
      <div
        className="panel"
        style={{
          marginBottom: "18px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "24px",
            padding: "22px 24px",
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
                gap: "9px",
                marginBottom: "7px",
              }}
            >
              <span
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: activeVisit
                    ? "#66d17a"
                    : "#66676d",
                  boxShadow: activeVisit
                    ? "0 0 14px rgba(102, 209, 122, 0.45)"
                    : "none",
                }}
              />

              <span
                style={{
                  color: activeVisit
                    ? "#8bd899"
                    : "#888990",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing:
                    "0.08em",
                }}
              >
                {activeVisit
                  ? "ACTIVE SHOW"
                  : "SHOW OPERATIONS"}
              </span>
            </div>

            {loading ? (
              <>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "18px",
                  }}
                >
                  Loading show status...
                </h3>
              </>
            ) : activeVisit ? (
              <>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "20px",
                  }}
                >
                  {activeVisit.show.name}
                </h3>

                <p
                  style={{
                    margin:
                      "7px 0 0",
                    color: "#85868d",
                    fontSize: "13px",
                  }}
                >
                  {formatDate(
                    activeVisit.visitDate
                  )}
                  {" · "}
                  Singles starting value{" "}
                  {money(
                    Number(
                      activeVisit.startingSinglesValue
                    ) +
                      Number(
                        activeVisit.startingCash
                      ) +
                      Number(
                        activeVisit.startingDigital
                      )
                  )}
                </p>
              </>
            ) : (
              <>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "20px",
                  }}
                >
                  No Active Show
                </h3>

                <p
                  style={{
                    margin:
                      "7px 0 0",
                    color: "#85868d",
                    fontSize: "13px",
                  }}
                >
                  Start a visit when you
                  arrive at a show and capture
                  your starting Singles
                  position.
                </p>
              </>
            )}
          </div>

          {!loading && (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (activeVisit) {
                  void openActiveVisit();
                } else {
                  void openStartVisit();
                }
              }}
            >
              {activeVisit
                ? "Open Show"
                : "Start Show"}
            </button>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: "12px 24px",
              borderTop:
                "1px solid #302426",
              background:
                "rgba(138, 54, 58, 0.12)",
              color: "#e8a4a8",
              fontSize: "12px",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {showStartModal && (
        <StartVisitModal
          shows={shows}
          onClose={() =>
            setShowStartModal(false)
          }
          onStarted={async (
            visit
          ) => {
            setShowStartModal(false);

            setActiveVisit(visit);

            await loadVisitWorkspace(
              visit.id
            );

            setShowVisitModal(true);

            // Starting a visit changes Show state throughout the app.
            notifyBusinessDataChanged();
          }}
        />
      )}

      {showVisitModal &&
        activeVisit && (
          <ActiveVisitModal
            visit={activeVisit}
            performance={
              performance
            }
            visitDetail={
              visitDetail
            }
            showEndForm={
              showEndForm
            }
            showReview={
              showReview
            }
            onClose={() => {
              setShowVisitModal(false);
              setShowEndForm(false);
              setShowReview(false);
            }}
            onRefresh={async () => {
              await loadVisitWorkspace(
                activeVisit.id
              );

              await loadActiveVisit();
            }}
            onBeginEnd={() => {
              setShowEndForm(true);
              setShowReview(false);
            }}
            onCancelEnd={() => {
              setShowEndForm(false);
              setShowReview(false);
            }}
            onReview={() => {
              setShowReview(true);
            }}
            onBackFromReview={() => {
              setShowReview(false);
            }}
            onFinalized={
              handleVisitFinalized
            }
          />
        )}
    </>
  );
}

// ---------------------------------------------------------
// START VISIT MODAL
// ---------------------------------------------------------

function StartVisitModal({
  shows,
  onClose,
  onStarted,
}: {
  shows: Show[];
  onClose: () => void;
  onStarted: (
    visit: ShowVisit
  ) => Promise<void>;
}) {
  const activeShows =
    shows.filter(
      (show) => show.active
    );

  const [form, setForm] =
    useState<StartVisitForm>({
      showId:
        activeShows.length > 0
          ? String(
              activeShows[0].id
            )
          : "",
      visitDate:
        todayInputValue(),
      startingSinglesValue: "",
      startingCash: "",
      startingDigital: "",
    });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [currentSinglesFunds, setCurrentSinglesFunds] =
    useState<number | null>(null);

  const [currentSinglesCash, setCurrentSinglesCash] =
    useState<number | null>(null);

  const [currentSinglesDigital, setCurrentSinglesDigital] =
    useState<number | null>(null);

  const [currentSinglesUnallocated, setCurrentSinglesUnallocated] =
    useState<number | null>(null);

  const [fundsLoading, setFundsLoading] =
    useState(true);

  // The live Singles ledger is the source of truth for both the total
  // balance and where that money is actually held. When the modal opens,
  // load the persistent Cash and Digital balances and use those exact
  // values as the starting Show snapshot.
  useEffect(() => {
    let cancelled = false;

    async function loadSinglesFunds() {
      try {
        setFundsLoading(true);

        const response = await fetch(
          "/api/funds/summary"
        );

        if (!response.ok) {
          throw new Error(
            await readApiError(
              response,
              "Singles funds could not be loaded."
            )
          );
        }

        const summary =
          (await response.json()) as FundsSummary;

        const singlesBalance = Number(
          summary.singlesBalance ?? 0
        );

        const singlesCash = Number(
          summary.singlesCashBalance ?? 0
        );

        const singlesDigital = Number(
          summary.singlesDigitalBalance ?? 0
        );

        const singlesUnallocated = Number(
          summary.singlesUnallocatedBalance ?? 0
        );

        if (
          !Number.isFinite(singlesBalance) ||
          !Number.isFinite(singlesCash) ||
          !Number.isFinite(singlesDigital) ||
          !Number.isFinite(singlesUnallocated)
        ) {
          throw new Error(
            "Singles funds balance is invalid."
          );
        }

        if (cancelled) {
          return;
        }

        setCurrentSinglesFunds(
          singlesBalance
        );

        setCurrentSinglesCash(
          singlesCash
        );

        setCurrentSinglesDigital(
          singlesDigital
        );

        setCurrentSinglesUnallocated(
          singlesUnallocated
        );

        // Cash and Digital now come directly from the persistent ledger.
        // No manual reconstruction is needed when starting a Show.
        setForm((current) => ({
          ...current,
          startingCash:
            singlesCash.toFixed(2),
          startingDigital:
            singlesDigital.toFixed(2),
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCurrentSinglesFunds(null);
        setCurrentSinglesCash(null);
        setCurrentSinglesDigital(null);
        setCurrentSinglesUnallocated(null);

        setError(
          error instanceof Error
            ? error.message
            : "Singles funds could not be loaded."
        );
      } finally {
        if (!cancelled) {
          setFundsLoading(false);
        }
      }
    }

    void loadSinglesFunds();

    return () => {
      cancelled = true;
    };
  }, []);

  const enteredStartingCashCents =
    moneyInputToCents(
      form.startingCash
    );

  const enteredStartingDigitalCents =
    moneyInputToCents(
      form.startingDigital
    );

  const enteredStartingFundsCents =
    enteredStartingCashCents +
    enteredStartingDigitalCents;

  const currentSinglesFundsCents =
    currentSinglesFunds === null
      ? null
      : Math.round(
          currentSinglesFunds * 100
        );

  const currentSinglesCashCents =
    currentSinglesCash === null
      ? null
      : Math.round(
          currentSinglesCash * 100
        );

  const currentSinglesDigitalCents =
    currentSinglesDigital === null
      ? null
      : Math.round(
          currentSinglesDigital * 100
        );

  const currentSinglesUnallocatedCents =
    currentSinglesUnallocated === null
      ? null
      : Math.round(
          currentSinglesUnallocated * 100
        );

  const cashMatchesLedger =
    currentSinglesCashCents !== null &&
    enteredStartingCashCents ===
      currentSinglesCashCents;

  const digitalMatchesLedger =
    currentSinglesDigitalCents !== null &&
    enteredStartingDigitalCents ===
      currentSinglesDigitalCents;

  const noUnallocatedSinglesFunds =
    currentSinglesUnallocatedCents !== null &&
    currentSinglesUnallocatedCents === 0;

  const startingFundsMatch =
    currentSinglesFundsCents !== null &&
    enteredStartingFundsCents ===
      currentSinglesFundsCents &&
    cashMatchesLedger &&
    digitalMatchesLedger &&
    noUnallocatedSinglesFunds;

  function updateForm(
    field: keyof StartVisitForm,
    value: string
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

    setError(null);

    const showId =
      Number(form.showId);

    if (
      !Number.isInteger(showId) ||
      showId <= 0
    ) {
      setError(
        "Select a show."
      );
      return;
    }

    if (!form.visitDate) {
      setError(
        "Visit date is required."
      );
      return;
    }

    if (
      !isValidMoneyInput(
        form.startingSinglesValue
      )
    ) {
      setError(
        "Enter a valid starting Singles inventory value."
      );
      return;
    }

    if (
      !isValidMoneyInput(
        form.startingCash
      )
    ) {
      setError(
        "Enter a valid starting Singles cash amount."
      );
      return;
    }

    if (
      !isValidMoneyInput(
        form.startingDigital
      )
    ) {
      setError(
        "Enter a valid starting Singles digital amount."
      );
      return;
    }

    if (
      currentSinglesFundsCents === null ||
      currentSinglesCashCents === null ||
      currentSinglesDigitalCents === null ||
      currentSinglesUnallocatedCents === null
    ) {
      setError(
        "Current Singles funds could not be verified. Close this window and try again."
      );
      return;
    }

    if (!noUnallocatedSinglesFunds) {
      setError(
        `You have ${money(
          currentSinglesUnallocated
        )} of unallocated Singles funds. Allocate those funds to Cash or Digital before starting a Show.`
      );
      return;
    }

    if (!cashMatchesLedger || !digitalMatchesLedger) {
      setError(
        `Starting Show funds must match the persistent Singles balances: ${money(
          currentSinglesCash
        )} Cash and ${money(
          currentSinglesDigital
        )} Digital.`
      );
      return;
    }

    const selectedShow =
      shows.find(
        (show) =>
          show.id === showId
      );

    if (!selectedShow) {
      setError(
        "Selected show could not be found."
      );
      return;
    }

    try {
      setSaving(true);

      // If this show/date already exists as a planned
      // calendar visit, use it instead of creating another.
      const existingVisit =
        selectedShow.visits.find(
          (visit) =>
            dateInputValue(
              visit.visitDate
            ) === form.visitDate
        );

      let visitId:
        | number
        | null = null;

      if (existingVisit) {
        if (
          existingVisit.status !==
          "PLANNED"
        ) {
          throw new Error(
            existingVisit.status ===
            "ACTIVE"
              ? "This visit is already active."
              : "This visit has already been finalized."
          );
        }

        visitId =
          existingVisit.id;
      } else {
        // The dashboard Start Visit action creates the
        // calendar visit first...
        const createResponse =
          await fetch(
            `/api/shows/${showId}/visits`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                visitDate:
                  form.visitDate,
              }),
            }
          );

        if (!createResponse.ok) {
          throw new Error(
            await readApiError(
              createResponse,
              "Show visit could not be created."
            )
          );
        }

        const createdVisit =
          (await createResponse.json()) as ShowVisit;

        visitId =
          createdVisit.id;
      }

      // ...then immediately begins it using the
      // starting Singles snapshot entered above.
      const beginResponse =
        await fetch(
          `/api/shows/visits/${visitId}/begin`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              startingSinglesValue:
                Number(
                  form.startingSinglesValue
                ),

              startingCash:
                Number(
                  form.startingCash
                ),

              startingDigital:
                Number(
                  form.startingDigital
                ),
            }),
          }
        );

      if (!beginResponse.ok) {
        throw new Error(
          await readApiError(
            beginResponse,
            "Show visit could not be started."
          )
        );
      }

      const startedVisit =
        (await beginResponse.json()) as ShowVisit;

      await onStarted(
        startedVisit
      );
    } catch (error) {
      console.error(
        "Start visit error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Show visit could not be started."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Start Show"
      subtitle="Capture the Singles inventory snapshot and reconcile the live Singles funds you are bringing into the Show."
      onClose={onClose}
      maxWidth="620px"
    >
      <form
        onSubmit={
          handleSubmit
        }
      >
        <ModalBody>
          {activeShows.length ===
          0 ? (
            <NoticeBox>
              No active Shows are
              available. Create or
              reactivate a Show from the
              Shows page first.
            </NoticeBox>
          ) : (
            <>
              <FormField
                label="Show"
              >
                <select
                  value={
                    form.showId
                  }
                  onChange={(
                    event
                  ) =>
                    updateForm(
                      "showId",
                      event.target.value
                    )
                  }
                  style={
                    inputStyle
                  }
                >
                  {activeShows.map(
                    (show) => (
                      <option
                        key={
                          show.id
                        }
                        value={
                          show.id
                        }
                      >
                        {
                          show.name
                        }
                      </option>
                    )
                  )}
                </select>
              </FormField>

              <FormField
                label="Visit Date"
              >
                <input
                  type="date"
                  value={
                    form.visitDate
                  }
                  onChange={(
                    event
                  ) =>
                    updateForm(
                      "visitDate",
                      event.target.value
                    )
                  }
                  style={
                    inputStyle
                  }
                />
              </FormField>

              <div
                style={{
                  margin:
                    "22px 0 14px",
                  borderTop:
                    "1px solid #292a2f",
                }}
              />

              <div
                style={{
                  marginBottom:
                    "16px",
                }}
              >
                <strong
                  style={{
                    display:
                      "block",
                    marginBottom:
                      "5px",
                    fontSize:
                      "13px",
                  }}
                >
                  Starting Singles
                  Snapshot
                </strong>

                <span
                  style={{
                    color:
                      "#7f8087",
                    fontSize:
                      "12px",
                  }}
                >
                  Inventory is a valuation snapshot. Cash and Digital
                  must reconcile to the live Singles Funds ledger. Sealed
                  funds remain separate.
                </span>
              </div>

              <MoneyField
                label="Singles Inventory Value"
                value={
                  form.startingSinglesValue
                }
                onChange={(
                  value
                ) =>
                  updateForm(
                    "startingSinglesValue",
                    value
                  )
                }
              />

              <div
                style={{
                  padding: "14px 15px",
                  marginBottom: "14px",
                  border: "1px solid #303137",
                  borderRadius: "9px",
                  background: "#1a1b20",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      color: "#85868d",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Current Singles Funds
                  </span>

                  <strong
                    style={{
                      fontSize: "18px",
                    }}
                  >
                    {fundsLoading
                      ? "Loading..."
                      : money(
                          currentSinglesFunds
                        )}
                  </strong>
                </div>

                {!fundsLoading && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(2, minmax(0, 1fr))",
                      gap: "8px",
                      marginTop: "12px",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 11px",
                        border: "1px solid #292a30",
                        borderRadius: "8px",
                        background: "#121317",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          color: "#777880",
                          fontSize: "10px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Cash
                      </span>

                      <strong
                        style={{
                          display: "block",
                          marginTop: "4px",
                          fontSize: "14px",
                        }}
                      >
                        {money(
                          currentSinglesCash
                        )}
                      </strong>
                    </div>

                    <div
                      style={{
                        padding: "10px 11px",
                        border: "1px solid #292a30",
                        borderRadius: "8px",
                        background: "#121317",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          color: "#777880",
                          fontSize: "10px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Digital
                      </span>

                      <strong
                        style={{
                          display: "block",
                          marginTop: "4px",
                          fontSize: "14px",
                        }}
                      >
                        {money(
                          currentSinglesDigital
                        )}
                      </strong>
                    </div>
                  </div>
                )}

                {!fundsLoading &&
                  currentSinglesUnallocatedCents !==
                    null &&
                  currentSinglesUnallocatedCents !==
                    0 && (
                    <div
                      style={{
                        marginTop: "10px",
                        padding: "10px 11px",
                        border:
                          "1px solid #5a3d3f",
                        borderRadius: "8px",
                        background: "#251b1d",
                        color: "#e8a4a8",
                        fontSize: "11px",
                        lineHeight: 1.5,
                      }}
                    >
                      {money(
                        currentSinglesUnallocated
                      )}{" "}
                      of Singles funds is still
                      unallocated. Assign it to
                      Cash or Digital before
                      starting a Show.
                    </div>
                  )}

                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#777880",
                    fontSize: "11px",
                    lineHeight: 1.5,
                  }}
                >
                  Starting Cash and Digital are loaded automatically from
                  the persistent Singles ledger.
                </p>
              </div>

              <ReadOnlyMoneyField
                label="Starting Singles Cash"
                value={
                  form.startingCash
                }
              />

              <ReadOnlyMoneyField
                label="Starting Singles Digital"
                value={
                  form.startingDigital
                }
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "16px",
                  marginTop: "14px",
                  padding: "11px 12px",
                  border: startingFundsMatch
                    ? "1px solid #304b36"
                    : "1px solid #5a3d3f",
                  borderRadius: "8px",
                  background: startingFundsMatch
                    ? "#19231c"
                    : "#251b1d",
                  fontSize: "12px",
                }}
              >
                <span>
                  Starting Funds
                </span>

                <strong
                  style={{
                    color: startingFundsMatch
                      ? "#82d591"
                      : "#e48c92",
                  }}
                >
                  {money(
                    enteredStartingFundsCents /
                      100
                  )}
                </strong>
              </div>

              <SnapshotSummary
                inventory={
                  Number(
                    form.startingSinglesValue ||
                      0
                  )
                }
                cash={Number(
                  form.startingCash ||
                    0
                )}
                digital={Number(
                  form.startingDigital ||
                    0
                )}
                label="Starting Singles Business Value"
              />
            </>
          )}

          {error && (
            <ErrorBox>
              {error}
            </ErrorBox>
          )}
        </ModalBody>

        <ModalFooter>
          <SecondaryButton
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </SecondaryButton>

          <button
            type="submit"
            className="primary-button"
            disabled={
              saving ||
              fundsLoading ||
              !startingFundsMatch ||
              activeShows.length ===
                0
            }
          >
            {saving
              ? "Starting..."
              : "Begin Show"}
          </button>
        </ModalFooter>
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// ACTIVE VISIT MODAL
// ---------------------------------------------------------

function ActiveVisitModal({
  visit,
  performance,
  visitDetail,
  showEndForm,
  showReview,
  onClose,
  onRefresh,
  onBeginEnd,
  onCancelEnd,
  onReview,
  onBackFromReview,
  onFinalized,
}: {
  visit: ShowVisit;

  performance:
    | VisitPerformance
    | null;

  visitDetail:
    | VisitDetail
    | null;

  showEndForm: boolean;
  showReview: boolean;

  onClose: () => void;
  onRefresh: () => Promise<void>;
  onBeginEnd: () => void;
  onCancelEnd: () => void;
  onReview: () => void;
  onBackFromReview: () => void;

  onFinalized: () => Promise<void>;
}) {
  const [
    endingForm,
    setEndingForm,
  ] =
    useState<EndingSnapshotForm>({
      endingSinglesValue:
        visit.startingSinglesValue,
      endingCash:
        visit.startingCash,
      endingDigital:
        visit.startingDigital,
    });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  // When true, the existing Sales workflow is shown inside
  // this active Show Visit. The sale is locked to this visit.
  const [recordingSale, setRecordingSale] =
    useState(false);

  function updateEndingForm(
    field:
      keyof EndingSnapshotForm,
    value: string
  ) {
    setEndingForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  }

  function validateEndingForm():
    | string
    | null {
    if (
      !isValidMoneyInput(
        endingForm.endingSinglesValue
      )
    ) {
      return "Enter a valid ending Singles inventory value.";
    }

    if (
      !isValidMoneyInput(
        endingForm.endingCash
      )
    ) {
      return "Enter a valid ending Singles cash amount.";
    }

    if (
      !isValidMoneyInput(
        endingForm.endingDigital
      )
    ) {
      return "Enter a valid ending Singles digital amount.";
    }

    return null;
  }

  function handleReview(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const validationError =
      validateEndingForm();

    if (validationError) {
      setError(
        validationError
      );
      return;
    }

    setError(null);
    onReview();
  }

  async function finalizeVisit() {
    const validationError =
      validateEndingForm();

    if (validationError) {
      setError(
        validationError
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response =
        await fetch(
          `/api/shows/visits/${visit.id}/finalize`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              endingSinglesValue:
                Number(
                  endingForm.endingSinglesValue
                ),

              endingCash:
                Number(
                  endingForm.endingCash
                ),

              endingDigital:
                Number(
                  endingForm.endingDigital
                ),
            }),
          }
        );

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            "Show visit could not be finalized."
          )
        );
      }

      await onFinalized();
    } catch (error) {
      console.error(
        "Finalize visit error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Show visit could not be finalized."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={visit.show.name}
      subtitle={`${formatDate(
        visit.visitDate
      )} · Active Show`}
      onClose={onClose}
      maxWidth="920px"
    >
      {!showEndForm ? (
        recordingSale ? (
          <>
            <ModalBody>
              <SalesPage
                initialShowVisitId={visit.id}
                onCancelShowSale={() => {
                  setRecordingSale(false);
                }}
                onSaleRecorded={() => {
                  // The normal Sales workflow already handles
                  // FIFO, inventory, COGS, and SEALED Funds.
                  // After it saves, return to the Show workspace,
                  // reload the linked Show performance, and tell the
                  // rest of the dashboard that shared data changed.
                  setRecordingSale(false);

                  void onRefresh().then(() => {
                    notifyBusinessDataChanged();
                  });
                }}
              />
            </ModalBody>

            <ModalFooter>
              <SecondaryButton
                onClick={() => {
                  setRecordingSale(false);
                }}
              >
                Back to Show
              </SecondaryButton>
            </ModalFooter>
          </>
        ) : (
          <>
            <ModalBody>
              <ActiveVisitOverview
                visit={visit}
                performance={
                  performance
                }
                visitDetail={
                  visitDetail
                }
              />

              {error && (
                <ErrorBox>
                  {error}
                </ErrorBox>
              )}
            </ModalBody>

            <ModalFooter>
              <SecondaryButton
                onClick={() => {
                  void onRefresh();
                }}
              >
                Refresh
              </SecondaryButton>

              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setRecordingSale(true);
                }}
              >
                Record Sealed Sale
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={
                  onBeginEnd
                }
              >
                End Show
              </button>
            </ModalFooter>
          </>
        )
      ) : !showReview ? (
        <form
          onSubmit={
            handleReview
          }
        >
          <ModalBody>
            <div
              style={{
                marginBottom:
                  "20px",
              }}
            >
              <h3
                style={{
                  margin:
                    "0 0 6px",
                  fontSize:
                    "16px",
                }}
              >
                Ending Snapshot
              </h3>

              <p
                style={{
                  margin: 0,
                  color:
                    "#7f8087",
                  fontSize:
                    "12px",
                  lineHeight:
                    1.6,
                }}
              >
                Recount the
                Singles inventory
                and funds you are
                leaving the show
                with.
              </p>
            </div>

            <MoneyField
              label="Ending Singles Inventory Value"
              value={
                endingForm.endingSinglesValue
              }
              onChange={(
                value
              ) =>
                updateEndingForm(
                  "endingSinglesValue",
                  value
                )
              }
            />

            <MoneyField
              label="Ending Singles Cash"
              value={
                endingForm.endingCash
              }
              onChange={(
                value
              ) =>
                updateEndingForm(
                  "endingCash",
                  value
                )
              }
            />

            <MoneyField
              label="Ending Singles Digital"
              value={
                endingForm.endingDigital
              }
              onChange={(
                value
              ) =>
                updateEndingForm(
                  "endingDigital",
                  value
                )
              }
            />

            <SnapshotSummary
              inventory={
                Number(
                  endingForm.endingSinglesValue ||
                    0
                )
              }
              cash={Number(
                endingForm.endingCash ||
                  0
              )}
              digital={Number(
                endingForm.endingDigital ||
                  0
              )}
              label="Ending Singles Business Value"
            />

            {error && (
              <ErrorBox>
                {error}
              </ErrorBox>
            )}
          </ModalBody>

          <ModalFooter>
            <SecondaryButton
              onClick={
                onCancelEnd
              }
            >
              Back
            </SecondaryButton>

            <button
              type="submit"
              className="primary-button"
            >
              Review Show
            </button>
          </ModalFooter>
        </form>
      ) : (
        <>
          <ModalBody>
            <ShowReview
              visit={visit}
              performance={
                performance
              }
              endingForm={
                endingForm
              }
            />

            {error && (
              <ErrorBox>
                {error}
              </ErrorBox>
            )}
          </ModalBody>

          <ModalFooter>
            <SecondaryButton
              onClick={
                onBackFromReview
              }
              disabled={saving}
            >
              Edit Ending Values
            </SecondaryButton>

            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={() => {
                void finalizeVisit();
              }}
            >
              {saving
                ? "Finalizing..."
                : "Finalize Show"}
            </button>
          </ModalFooter>
        </>
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------
// ACTIVE VISIT OVERVIEW
// ---------------------------------------------------------

function ActiveVisitOverview({
  visit,
  performance,
  visitDetail,
}: {
  visit: ShowVisit;

  performance:
    | VisitPerformance
    | null;

  visitDetail:
    | VisitDetail
    | null;
}) {
  const startingInventory =
    Number(
      visit.startingSinglesValue
    );

  const startingCash =
    Number(visit.startingCash);

  const startingDigital =
    Number(
      visit.startingDigital
    );

  const startingFunds =
    startingCash +
    startingDigital;

  const startingBusinessValue =
    startingInventory +
    startingFunds;

  return (
    <>
      <SectionTitle
        title="Starting Singles Position"
        subtitle="Snapshot captured when the visit began."
      />

      <MetricRow>
        <MiniMetric
          label="Inventory"
          value={money(
            startingInventory
          )}
        />

        <MiniMetric
          label="Cash"
          value={money(
            startingCash
          )}
        />

        <MiniMetric
          label="Digital"
          value={money(
            startingDigital
          )}
        />

        <MiniMetric
          label="Business Value"
          value={money(
            startingBusinessValue
          )}
          emphasized
        />
      </MetricRow>

      <Divider />

      <SectionTitle
        title="Live Sealed Performance"
        subtitle="Calculated from sealed sales linked to this visit."
      />

      <MetricRow>
        <MiniMetric
          label="Revenue"
          value={money(
            performance?.sealed
              .revenue
          )}
        />

        <MiniMetric
          label="COGS"
          value={money(
            performance?.sealed
              .cogs
          )}
        />

        <MiniMetric
          label="Gross Profit"
          value={money(
            performance?.sealed
              .grossProfit
          )}
          emphasized
        />

        <MiniMetric
          label="Gross Margin"
          value={percent(
            performance?.sealed
              .grossMargin
          )}
        />
      </MetricRow>

      <div
        style={{
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
          marginTop: "14px",
          color: "#87888f",
          fontSize: "12px",
        }}
      >
        <span>
          {
            performance?.sealed
              .salesTransactions ??
            0
          }{" "}
          transactions
        </span>

        <span>
          {
            performance?.sealed
              .unitsSold ?? 0
          }{" "}
          units sold
        </span>

        <span>
          Cash revenue{" "}
          {money(
            performance?.sealed
              .cashRevenue
          )}
        </span>

        <span>
          Digital revenue{" "}
          {money(
            performance?.sealed
              .digitalRevenue
          )}
        </span>
      </div>

      <Divider />

      <SectionTitle
        title="Sealed Sales"
        subtitle="Sales currently attached to this active visit."
      />

      {!visitDetail ||
      visitDetail.sales.length ===
        0 ? (
        <div
          style={{
            padding: "20px",
            border:
              "1px dashed #303137",
            borderRadius: "10px",
            color: "#74757c",
            fontSize: "12px",
            textAlign: "center",
          }}
        >
          No sealed sales have been
          recorded for this visit yet.
        </div>
      ) : (
        <div
          style={{
            border:
              "1px solid #292a30",
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          {visitDetail.sales.map(
            (sale, index) => {
              const revenue =
                sale.lines.reduce(
                  (
                    total,
                    line
                  ) =>
                    total +
                    Number(
                      line.revenue
                    ),
                  0
                );

              const units =
                sale.lines.reduce(
                  (
                    total,
                    line
                  ) =>
                    total +
                    line.quantity,
                  0
                );

              return (
                <div
                  key={
                    sale.id
                  }
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "1fr auto auto auto",
                    gap: "18px",
                    alignItems:
                      "center",
                    padding:
                      "13px 15px",
                    borderTop:
                      index === 0
                        ? "none"
                        : "1px solid #292a30",
                  }}
                >
                  <div>
                    <strong
                      style={{
                        display:
                          "block",
                        fontSize:
                          "12px",
                      }}
                    >
                      {
                        sale.saleNumber
                      }
                    </strong>

                    <span
                      style={{
                        color:
                          "#777880",
                        fontSize:
                          "11px",
                      }}
                    >
                      {formatDate(
                        sale.saleDate
                      )}
                    </span>
                  </div>

                  <span
                    style={{
                      color:
                        "#a8a8ad",
                      fontSize:
                        "12px",
                    }}
                  >
                    {units} units
                  </span>

                  <span
                    style={{
                      color:
                        "#a8a8ad",
                      fontSize:
                        "12px",
                    }}
                  >
                    {
                      sale.paymentMethod
                    }
                  </span>

                  <strong
                    style={{
                      fontSize:
                        "12px",
                    }}
                  >
                    {money(
                      revenue
                    )}
                  </strong>
                </div>
              );
            }
          )}
        </div>
      )}

    </>
  );
}

// ---------------------------------------------------------
// SHOW REVIEW
// ---------------------------------------------------------

function ShowReview({
  visit,
  performance,
  endingForm,
}: {
  visit: ShowVisit;

  performance:
    | VisitPerformance
    | null;

  endingForm: EndingSnapshotForm;
}) {
  const startingInventory =
    Number(
      visit.startingSinglesValue
    );

  const startingCash =
    Number(visit.startingCash);

  const startingDigital =
    Number(
      visit.startingDigital
    );

  const endingInventory =
    Number(
      endingForm.endingSinglesValue
    );

  const endingCash =
    Number(
      endingForm.endingCash
    );

  const endingDigital =
    Number(
      endingForm.endingDigital
    );

  const startingFunds =
    startingCash +
    startingDigital;

  const endingFunds =
    endingCash +
    endingDigital;

  const startingBusinessValue =
    startingInventory +
    startingFunds;

  const endingBusinessValue =
    endingInventory +
    endingFunds;

  const inventoryChange =
    endingInventory -
    startingInventory;

  const fundsChange =
    endingFunds -
    startingFunds;

  const businessValueChange =
    endingBusinessValue -
    startingBusinessValue;

  return (
    <>
      <SectionTitle
        title="Show Review"
        subtitle="Review the before-and-after Singles position before finalizing."
      />

      <div
        style={{
          overflowX: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse:
              "collapse",
            minWidth: "620px",
          }}
        >
          <thead>
            <tr>
              <ReviewHeader>
                Singles
              </ReviewHeader>

              <ReviewHeader>
                Start
              </ReviewHeader>

              <ReviewHeader>
                End
              </ReviewHeader>

              <ReviewHeader>
                Change
              </ReviewHeader>
            </tr>
          </thead>

          <tbody>
            <ReviewRow
              label="Inventory Value"
              start={
                startingInventory
              }
              end={
                endingInventory
              }
              change={
                inventoryChange
              }
            />

            <ReviewRow
              label="Cash"
              start={
                startingCash
              }
              end={endingCash}
              change={
                endingCash -
                startingCash
              }
            />

            <ReviewRow
              label="Digital"
              start={
                startingDigital
              }
              end={
                endingDigital
              }
              change={
                endingDigital -
                startingDigital
              }
            />

            <ReviewRow
              label="Singles Funds"
              start={
                startingFunds
              }
              end={
                endingFunds
              }
              change={
                fundsChange
              }
              bold
            />

            <ReviewRow
              label="Singles Business Value"
              start={
                startingBusinessValue
              }
              end={
                endingBusinessValue
              }
              change={
                businessValueChange
              }
              bold
            />
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: "20px",
          padding:
            "16px 18px",
          border:
            "1px solid #303137",
          borderRadius: "10px",
          background:
            "#1a1b20",
        }}
      >
        <div
          style={{
            color: "#83848b",
            fontSize: "11px",
            textTransform:
              "uppercase",
            letterSpacing:
              "0.07em",
            marginBottom:
              "8px",
          }}
        >
          Funds Ledger Impact
        </div>

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems:
              "baseline",
            gap: "16px",
          }}
        >
          <strong>
            Singles Funds Change
          </strong>

          <strong
            style={{
              fontSize: "20px",
              color:
                fundsChange >= 0
                  ? "#82d591"
                  : "#e48c92",
            }}
          >
            {fundsChange >= 0
              ? "+"
              : ""}
            {money(
              fundsChange
            )}
          </strong>
        </div>

        <p
          style={{
            margin:
              "9px 0 0",
            color: "#777880",
            fontSize: "12px",
            lineHeight: 1.6,
          }}
        >
          Finalizing will post only
          this funds change to the
          Singles funds ledger.
          Inventory value changes are
          valuation information and do
          not become cash or revenue.
        </p>
      </div>

      <Divider />

      <SectionTitle
        title="Sealed Performance"
        subtitle="Sealed sales remain separate from the Singles funds snapshot."
      />

      <MetricRow>
        <MiniMetric
          label="Revenue"
          value={money(
            performance?.sealed
              .revenue
          )}
        />

        <MiniMetric
          label="COGS"
          value={money(
            performance?.sealed
              .cogs
          )}
        />

        <MiniMetric
          label="Gross Profit"
          value={money(
            performance?.sealed
              .grossProfit
          )}
        />

        <MiniMetric
          label="Units Sold"
          value={String(
            performance?.sealed
              .unitsSold ?? 0
          )}
        />
      </MetricRow>
    </>
  );
}

// ---------------------------------------------------------
// SMALL UI COMPONENTS
// ---------------------------------------------------------

function ModalShell({
  title,
  subtitle,
  onClose,
  maxWidth,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  maxWidth: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "rgba(0, 0, 0, 0.74)",
        backdropFilter:
          "blur(4px)",
      }}
      onMouseDown={(
        event
      ) => {
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
          width: "100%",
          maxWidth,
          maxHeight:
            "90vh",
          overflowY: "auto",
          border:
            "1px solid #2c2d32",
          borderRadius: "14px",
          background:
            "#17181c",
          boxShadow:
            "0 24px 70px rgba(0, 0, 0, 0.48)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems:
              "flex-start",
            gap: "20px",
            padding:
              "21px 24px",
            borderBottom:
              "1px solid #292a2f",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize:
                  "18px",
              }}
            >
              {title}
            </h2>

            <p
              style={{
                margin:
                  "6px 0 0",
                color:
                  "#7f8087",
                fontSize:
                  "12px",
              }}
            >
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: "32px",
              height: "32px",
              border:
                "1px solid #303137",
              borderRadius:
                "8px",
              background:
                "#1d1e23",
              color:
                "#a4a5ab",
              cursor:
                "pointer",
              fontSize:
                "18px",
            }}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function ModalBody({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "22px 24px",
      }}
    >
      {children}
    </div>
  );
}

function ModalFooter({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent:
          "flex-end",
        gap: "10px",
        padding:
          "16px 24px",
        borderTop:
          "1px solid #292a2f",
      }}
    >
      {children}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom:
          "15px",
      }}
    >
      <span
        style={{
          display: "block",
          marginBottom:
            "7px",
          color: "#aaaab0",
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        {label}
      </span>

      {children}
    </label>
  );
}

function ReadOnlyMoneyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <FormField label={label}>
      <div
        style={{
          position: "relative",
        }}
      >
        <span
          style={{
            position:
              "absolute",
            left: "12px",
            top: "50%",
            transform:
              "translateY(-50%)",
            color:
              "#777880",
            fontSize:
              "13px",
          }}
        >
          $
        </span>

        <input
          type="number"
          value={value}
          readOnly
          aria-readonly="true"
          style={{
            ...inputStyle,
            paddingLeft:
              "28px",
            color: "#b9bac0",
            cursor: "default",
            background: "#15161a",
          }}
        />
      </div>
    </FormField>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
}) {
  return (
    <FormField label={label}>
      <div
        style={{
          position: "relative",
        }}
      >
        <span
          style={{
            position:
              "absolute",
            left: "12px",
            top: "50%",
            transform:
              "translateY(-50%)",
            color:
              "#777880",
            fontSize:
              "13px",
          }}
        >
          $
        </span>

        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(
            event
          ) =>
            onChange(
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
  );
}

function SnapshotSummary({
  inventory,
  cash,
  digital,
  label,
}: {
  inventory: number;
  cash: number;
  digital: number;
  label: string;
}) {
  const funds =
    cash + digital;

  const total =
    inventory + funds;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(3, minmax(0, 1fr))",
        gap: "10px",
        marginTop: "20px",
      }}
    >
      <SummaryBox
        label="Inventory"
        value={money(
          inventory
        )}
      />

      <SummaryBox
        label="Singles Funds"
        value={money(
          funds
        )}
      />

      <SummaryBox
        label={label}
        value={money(total)}
        emphasized
      />
    </div>
  );
}

function SummaryBox({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      style={{
        padding:
          "14px 15px",
        border: emphasized
          ? "1px solid #43454d"
          : "1px solid #292a30",
        borderRadius: "9px",
        background: emphasized
          ? "#202127"
          : "#1a1b20",
      }}
    >
      <div
        style={{
          color:
            "#777880",
          fontSize:
            "10px",
          textTransform:
            "uppercase",
          letterSpacing:
            "0.06em",
          marginBottom:
            "6px",
        }}
      >
        {label}
      </div>

      <strong
        style={{
          fontSize:
            emphasized
              ? "16px"
              : "14px",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        marginBottom: "14px",
      }}
    >
      <h3
        style={{
          margin:
            "0 0 5px",
          fontSize:
            "14px",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          margin: 0,
          color:
            "#777880",
          fontSize:
            "11px",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function MetricRow({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(4, minmax(0, 1fr))",
        gap: "10px",
      }}
    >
      {children}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      style={{
        padding:
          "13px 14px",
        border:
          "1px solid #292a30",
        borderRadius: "9px",
        background: emphasized
          ? "#202127"
          : "#1a1b20",
      }}
    >
      <span
        style={{
          display: "block",
          color:
            "#777880",
          fontSize:
            "10px",
          textTransform:
            "uppercase",
          letterSpacing:
            "0.06em",
          marginBottom:
            "6px",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          fontSize:
            emphasized
              ? "16px"
              : "14px",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function ReviewHeader({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <th
      style={{
        padding:
          "10px 12px",
        textAlign: "right",
        color:
          "#74757c",
        fontSize:
          "10px",
        fontWeight: 600,
        textTransform:
          "uppercase",
        letterSpacing:
          "0.06em",
        borderBottom:
          "1px solid #292a30",
      }}
    >
      {children}
    </th>
  );
}

function ReviewRow({
  label,
  start,
  end,
  change,
  bold = false,
}: {
  label: string;
  start: number;
  end: number;
  change: number;
  bold?: boolean;
}) {
  return (
    <tr
      style={{
        borderBottom:
          "1px solid #25262b",
      }}
    >
      <td
        style={{
          padding:
            "12px",
          fontSize:
            "12px",
          fontWeight:
            bold ? 700 : 500,
        }}
      >
        {label}
      </td>

      <ReviewMoneyCell
        value={start}
        bold={bold}
      />

      <ReviewMoneyCell
        value={end}
        bold={bold}
      />

      <td
        style={{
          padding:
            "12px",
          textAlign:
            "right",
          fontSize:
            "12px",
          fontWeight:
            bold ? 700 : 600,
          color:
            change > 0
              ? "#82d591"
              : change < 0
                ? "#e48c92"
                : "#aaaab0",
        }}
      >
        {change > 0
          ? "+"
          : ""}
        {money(change)}
      </td>
    </tr>
  );
}

function ReviewMoneyCell({
  value,
  bold,
}: {
  value: number;
  bold: boolean;
}) {
  return (
    <td
      style={{
        padding:
          "12px",
        textAlign:
          "right",
        color:
          "#b9bac0",
        fontSize:
          "12px",
        fontWeight:
          bold ? 700 : 400,
      }}
    >
      {money(value)}
    </td>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding:
          "9px 14px",
        border:
          "1px solid #34353b",
        borderRadius: "7px",
        background:
          "#1d1e23",
        color:
          "#b4b4ba",
        cursor: disabled
          ? "not-allowed"
          : "pointer",
        opacity:
          disabled
            ? 0.6
            : 1,
      }}
    >
      {children}
    </button>
  );
}

function NoticeBox({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding:
          "14px 16px",
        border:
          "1px solid #3a3527",
        borderRadius: "9px",
        background:
          "rgba(155, 122, 45, 0.10)",
        color:
          "#d3bd86",
        fontSize:
          "12px",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

function ErrorBox({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      style={{
        marginTop:
          "16px",
        padding:
          "12px 14px",
        border:
          "1px solid #493034",
        borderRadius: "8px",
        background:
          "rgba(143, 59, 64, 0.10)",
        color:
          "#e2a0a5",
        fontSize:
          "12px",
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        borderTop:
          "1px solid #292a2f",
        margin:
          "22px 0",
      }}
    />
  );
}

const inputStyle = {
  width: "100%",
  boxSizing:
    "border-box" as const,
  padding:
    "10px 12px",
  border:
    "1px solid #34353b",
  borderRadius: "7px",
  background:
    "#1b1c21",
  color: "#e1e1e4",
  outline: "none",
  fontSize: "13px",
};