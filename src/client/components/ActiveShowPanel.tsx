import { adminFetch } from "../adminFetch";
import { inputStyle } from "./uiStyles";
import {
  useCallback,
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
    createdAt: string;
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

type AvailablePackProduct = {
  sourceBoxProductId: number;
  sourceItemId: string;
  sourceBoxProductName: string;
  packDisplayName: string;
  defaultPackPrice: number | null;
  availablePacks: number;
  availableCostBasis: number;
  costPerPack: number;
};

type ShowPackSnapshot = {
  id: number;
  showVisitId: number;
  sourceBoxProductId: number;
  packDisplayName: string;
  startingPacks: number;
  addedPacks: number;
  giveaways: number;
  damaged: number;
  endingPacks: number | null;
  packsSold: number | null;
  declaredValuePerPack: string | number;
  startingCostBasis: string | number;
  startingCostPerPack: string | number;
  addedCostBasis: string | number;
  declaredSalesValue: string | number | null;
  estimatedCogs: string | number | null;
  actualRevenue: string | number | null;
  actualGrossProfit: string | number | null;
  actualGrossMargin: string | number | null;
  finalizedAt: string | null;
  sourceBoxProduct: { id: number; itemId: string; name: string; defaultPackPrice: string | number | null };
};

type PackEndingForm = {
  endingPacks: string;
  actualRevenue: string;
  actualCashRevenue: string;
  actualDigitalRevenue: string;
};

type ShowInventoryItem = {
  productId: number;
  itemId: string;
  productName: string;
  productType: "SEALED" | "SINGLE";
  unitsOnHand: number;
  inventoryValue: string | number;
  expectedSalePrice: string | number | null;
};

type InventoryDetail = {
  product: {
    id: number;
    name: string;
    expectedSalePrice: string | number | null;
  };
  batches: Array<{
    batchId: number;
    quantityRemaining: number;
    landedUnitCost: string | number;
  }>;
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

        const response = await adminFetch(
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
      const response = await adminFetch(
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
        adminFetch(
          `/api/shows/visits/${visitId}/performance`
        ),

        adminFetch(
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
        className={`panel active-show-overview${activeVisit ? " is-clickable" : ""}`}
        role={activeVisit ? "button" : undefined}
        tabIndex={activeVisit ? 0 : undefined}
        aria-label={activeVisit ? `Open active Show ${activeVisit.show.name}` : undefined}
        onClick={activeVisit ? () => { void openActiveVisit(); } : undefined}
        onKeyDown={activeVisit ? event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void openActiveVisit();
          }
        } : undefined}
      >
        <div
          className="active-show-overview-header"
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
            activeVisit ? (
              <span className="primary-button active-show-open-label" aria-hidden="true">Open Show</span>
            ) : (
              <button type="button" className="primary-button" onClick={() => { void openStartVisit(); }}>
                Start Show
              </button>
            )
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

  const [availablePacks, setAvailablePacks] = useState<AvailablePackProduct[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [selectedPacks, setSelectedPacks] = useState<Record<number, { selected: boolean; quantity: string; declaredValue: string }>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadPacks() {
      try {
        setPacksLoading(true);
        const response = await adminFetch("/api/shows/packs/available");
        if (!response.ok) throw new Error(await readApiError(response, "Pack inventory could not be loaded."));
        const items = (await response.json()) as AvailablePackProduct[];
        if (!cancelled) {
          setAvailablePacks(items);
          setSelectedPacks(Object.fromEntries(items.map(item => [item.sourceBoxProductId, {
            selected: false,
            quantity: String(item.availablePacks),
            declaredValue: item.defaultPackPrice === null ? "" : String(item.defaultPackPrice),
          }])));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Pack inventory could not be loaded.");
      } finally {
        if (!cancelled) setPacksLoading(false);
      }
    }
    void loadPacks();
    return () => { cancelled = true; };
  }, []);

  // The live Singles ledger is the source of truth for both the total
  // balance and where that money is actually held. When the modal opens,
  // load the persistent Cash and Digital balances and use those exact
  // values as the starting Show snapshot.
  useEffect(() => {
    let cancelled = false;

    async function loadSinglesFunds() {
      try {
        setFundsLoading(true);

        const response = await adminFetch(
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

    const packSnapshots = availablePacks.filter(item => selectedPacks[item.sourceBoxProductId]?.selected).map(item => ({
      sourceBoxProductId: item.sourceBoxProductId,
      startingPacks: Number(selectedPacks[item.sourceBoxProductId]?.quantity),
      declaredValuePerPack: Number(selectedPacks[item.sourceBoxProductId]?.declaredValue),
    }));
    if (packSnapshots.some(item => !Number.isSafeInteger(item.startingPacks) || item.startingPacks <= 0 ||
        !Number.isFinite(item.declaredValuePerPack) || item.declaredValuePerPack < 0)) {
      setError("Every selected Pack inventory row needs a positive quantity and a valid declared value per pack.");
      return;
    }
    if (packSnapshots.some(item => item.startingPacks > (availablePacks.find(pack => pack.sourceBoxProductId === item.sourceBoxProductId)?.availablePacks ?? 0))) {
      setError("Packs brought to the Show cannot exceed available Pack Inventory.");
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
          await adminFetch(
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
        await adminFetch(
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
              packSnapshots,
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

              <section className="show-pack-start">
                <div className="show-pack-heading"><div><h3>Packs</h3><p>Select pack inventory being brought into this Show. Starting quantity and cost are captured from PackPools.</p></div></div>
                {packsLoading ? <p className="show-inventory-empty">Loading pack inventory...</p> : availablePacks.length === 0 ? <p className="show-inventory-empty">No unallocated pack inventory is available.</p> : (
                  <div className="show-pack-start-list">
                    {availablePacks.map(item => {
                      const selection = selectedPacks[item.sourceBoxProductId] ?? { selected: false, quantity: String(item.availablePacks), declaredValue: "" };
                      return <div className={selection.selected ? "show-pack-start-row is-selected" : "show-pack-start-row"} key={item.sourceBoxProductId}>
                        <label><input type="checkbox" checked={selection.selected} onChange={event => setSelectedPacks(current => ({ ...current, [item.sourceBoxProductId]: { ...selection, selected: event.target.checked } }))} /><span><strong>{item.packDisplayName}</strong><small>From {item.sourceBoxProductName} · {item.availablePacks} packs · Cost {money(item.availableCostBasis)} · {money(item.costPerPack)} each</small></span></label>
                        <div><span>Packs brought to Show</span><input type="number" min="1" max={item.availablePacks} step="1" disabled={!selection.selected} value={selection.quantity} onChange={event => setSelectedPacks(current => ({ ...current, [item.sourceBoxProductId]: { ...selection, quantity: event.target.value } }))} /></div>
                        <div><span>Declared value / pack</span><input type="number" min="0" step="0.01" disabled={!selection.selected} value={selection.declaredValue} onChange={event => setSelectedPacks(current => ({ ...current, [item.sourceBoxProductId]: { ...selection, declaredValue: event.target.value } }))} /></div>
                      </div>;
                    })}
                  </div>
                )}
              </section>
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

  const [inventory, setInventory] =
    useState<ShowInventoryItem[]>([]);

  const [inventoryLoading, setInventoryLoading] =
    useState(true);

  const [selectedInventory, setSelectedInventory] =
    useState<ShowInventoryItem | null>(null);

  const [saleNotice, setSaleNotice] =
    useState<string | null>(null);

  const [packSnapshots, setPackSnapshots] = useState<ShowPackSnapshot[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [packEndingForms, setPackEndingForms] = useState<Record<number, PackEndingForm>>({});
  const [packAction, setPackAction] = useState<{ type: "ADD" | "BREAK"; snapshot: ShowPackSnapshot } | null>(null);

  const loadPackSnapshots = useCallback(async () => {
    try {
      setPacksLoading(true);
      const response = await adminFetch(`/api/shows/visits/${visit.id}/pack-snapshots`);
      if (!response.ok) throw new Error(await readApiError(response, "Show pack tracking could not be loaded."));
      const snapshots = (await response.json()) as ShowPackSnapshot[];
      setPackSnapshots(snapshots);
      setPackEndingForms(current => Object.fromEntries(snapshots.map(snapshot => [snapshot.id, current[snapshot.id] ?? {
        endingPacks: String(snapshot.startingPacks + snapshot.addedPacks - snapshot.giveaways - snapshot.damaged),
        actualRevenue: "",
        actualCashRevenue: "",
        actualDigitalRevenue: "",
      }])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Show pack tracking could not be loaded.");
    } finally {
      setPacksLoading(false);
    }
  }, [visit.id]);

  const loadInventory = useCallback(async () => {
    try {
      setInventoryLoading(true);
      const response = await adminFetch("/api/inventory");
      if (!response.ok) throw new Error(await readApiError(response, "Inventory could not be loaded."));
      const data = (await response.json()) as ShowInventoryItem[];
      setInventory(data.filter(item => item.productType === "SEALED" && item.unitsOnHand > 0));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Inventory could not be loaded.");
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadInventory();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [loadInventory]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadPackSnapshots(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPackSnapshots]);

  useEffect(() => {
    if (!showEndForm) return;
    setPackEndingForms(Object.fromEntries(packSnapshots.map(snapshot => [snapshot.id, {
      endingPacks: String(snapshot.startingPacks + snapshot.addedPacks - snapshot.giveaways - snapshot.damaged),
      actualRevenue: "",
      actualCashRevenue: "",
      actualDigitalRevenue: "",
    }])));
  }, [showEndForm, packSnapshots]);

  async function savePackAdjustments(snapshot: ShowPackSnapshot, giveaways: number, damaged: number) {
    try {
      setError(null);
      const response = await adminFetch(`/api/shows/visits/${visit.id}/pack-snapshots/${snapshot.id}/adjustments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giveaways, damaged }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Pack adjustments could not be saved."));
      await loadPackSnapshots();
      notifyBusinessDataChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pack adjustments could not be saved.");
    }
  }

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

    for (const snapshot of packSnapshots) {
      const packForm = packEndingForms[snapshot.id];
      const endingPacks = Number(packForm?.endingPacks);
      if (!packForm || !Number.isSafeInteger(endingPacks) || endingPacks < 0) {
        return `Enter a valid ending pack count for ${snapshot.packDisplayName}.`;
      }
      const packsSold = snapshot.startingPacks + snapshot.addedPacks - endingPacks - snapshot.giveaways - snapshot.damaged;
      if (packsSold < 0) return `Packs Sold cannot be negative for ${snapshot.packDisplayName}.`;
      if (packForm.actualRevenue.trim() !== "") {
        if (!isValidMoneyInput(packForm.actualRevenue) || !isValidMoneyInput(packForm.actualCashRevenue) || !isValidMoneyInput(packForm.actualDigitalRevenue)) {
          return `Enter valid Actual, Cash, and Digital pack revenue for ${snapshot.packDisplayName}.`;
        }
        if (moneyInputToCents(packForm.actualCashRevenue) + moneyInputToCents(packForm.actualDigitalRevenue) !== moneyInputToCents(packForm.actualRevenue)) {
          return `Pack Cash plus Digital must equal Actual Pack Revenue for ${snapshot.packDisplayName}.`;
        }
      }
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
        await adminFetch(
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
              packSnapshots: packSnapshots.map(snapshot => {
                const packForm = packEndingForms[snapshot.id];
                const actualEntered = packForm.actualRevenue.trim() !== "";
                return {
                  snapshotId: snapshot.id,
                  endingPacks: Number(packForm.endingPacks),
                  actualRevenue: actualEntered ? Number(packForm.actualRevenue) : null,
                  actualCashRevenue: actualEntered ? Number(packForm.actualCashRevenue) : null,
                  actualDigitalRevenue: actualEntered ? Number(packForm.actualDigitalRevenue) : null,
                };
              }),
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
          <>
            <ModalBody>
              {saleNotice && <div className="show-sale-success" role="status">{saleNotice}</div>}

              <ShowInventory
                inventory={inventory}
                loading={inventoryLoading}
                onSell={setSelectedInventory}
              />

              <ShowPackTracker
                snapshots={packSnapshots}
                loading={packsLoading}
                onAdjust={savePackAdjustments}
                onAdd={snapshot => setPackAction({ type: "ADD", snapshot })}
                onBreak={snapshot => setPackAction({ type: "BREAK", snapshot })}
              />

              <Divider />

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
                className="secondary-button"
                onClick={
                  onBeginEnd
                }
              >
                End Show
              </button>
            </ModalFooter>
          </>
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

            {packSnapshots.length > 0 && <section className="show-pack-ending">
              <div className="show-pack-heading"><div><h3>Ending Packs</h3><p>Enter the physical ending count. Actual revenue is optional; when entered, Cash and Digital must reconcile exactly.</p></div></div>
              {packSnapshots.map(snapshot => {
                const packForm = packEndingForms[snapshot.id];
                if (!packForm) return null;
                const sold = snapshot.startingPacks + snapshot.addedPacks - Number(packForm.endingPacks || 0) - snapshot.giveaways - snapshot.damaged;
                const actualEntered = packForm.actualRevenue.trim() !== "";
                const update = (field: keyof PackEndingForm, value: string) => setPackEndingForms(current => ({ ...current, [snapshot.id]: { ...packForm, [field]: value } }));
                return <div className="show-pack-ending-row" key={snapshot.id}>
                  <div className="show-pack-ending-title"><strong>{snapshot.packDisplayName}</strong><span>From {snapshot.sourceBoxProduct.name} · Started {snapshot.startingPacks} · Added {snapshot.addedPacks} · Giveaways {snapshot.giveaways} · Damaged {snapshot.damaged}</span></div>
                  <label><span>Ending Packs</span><input type="number" min="0" step="1" value={packForm.endingPacks} onChange={event => update("endingPacks", event.target.value)} /></label>
                  <label><span>Actual Revenue <small>optional</small></span><input type="number" min="0" step="0.01" placeholder="Leave blank" value={packForm.actualRevenue} onChange={event => {
                    const value = event.target.value;
                    setPackEndingForms(current => ({ ...current, [snapshot.id]: { ...packForm, actualRevenue: value, ...(value === "" ? { actualCashRevenue: "", actualDigitalRevenue: "" } : {}) } }));
                  }} /></label>
                  <label><span>Pack Cash</span><input type="number" min="0" step="0.01" disabled={!actualEntered} value={packForm.actualCashRevenue} onChange={event => update("actualCashRevenue", event.target.value)} /></label>
                  <label><span>Pack Digital</span><input type="number" min="0" step="0.01" disabled={!actualEntered} value={packForm.actualDigitalRevenue} onChange={event => update("actualDigitalRevenue", event.target.value)} /></label>
                  <div className={sold < 0 ? "show-pack-sold is-error" : "show-pack-sold"}><span>Packs Sold</span><strong>{sold}</strong><small>Declared sales {money(Math.max(0, sold) * Number(snapshot.declaredValuePerPack))}</small></div>
                </div>;
              })}
            </section>}

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
              packSnapshots={packSnapshots}
              packEndingForms={packEndingForms}
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

      {selectedInventory && (
        <QuickShowSaleModal
          visit={visit}
          item={selectedInventory}
          onClose={() => setSelectedInventory(null)}
          onSold={async saleNumber => {
            setSelectedInventory(null);
            setSaleNotice(`${saleNumber} recorded successfully.`);
            window.setTimeout(() => setSaleNotice(null), 3500);
            await Promise.all([loadInventory(), onRefresh()]);
            notifyBusinessDataChanged();
          }}
        />
      )}

      {packAction && <PackActionModal
        visitId={visit.id}
        snapshot={packAction.snapshot}
        type={packAction.type}
        onClose={() => setPackAction(null)}
        onComplete={async message => {
          setPackAction(null);
          setSaleNotice(message);
          window.setTimeout(() => setSaleNotice(null), 3500);
          await Promise.all([loadPackSnapshots(), loadInventory(), onRefresh()]);
          notifyBusinessDataChanged();
        }}
      />}
    </ModalShell>
  );
}

// ---------------------------------------------------------
// ACTIVE SHOW PACK TRACKING
// ---------------------------------------------------------

function ShowPackTracker({ snapshots, loading, onAdjust, onAdd, onBreak }: {
  snapshots: ShowPackSnapshot[];
  loading: boolean;
  onAdjust: (snapshot: ShowPackSnapshot, giveaways: number, damaged: number) => Promise<void>;
  onAdd: (snapshot: ShowPackSnapshot) => void;
  onBreak: (snapshot: ShowPackSnapshot) => void;
}) {
  return <section className="show-pack-tracker">
    <div className="show-pack-heading"><div><h3>Packs</h3><p>Quantity-based Show inventory. Cost remains tied to PackPools.</p></div></div>
    {loading ? <div className="show-inventory-empty">Loading pack tracking...</div> : snapshots.length === 0 ? <div className="show-inventory-empty">No Pack Inventory was included when this Show started.</div> : (
      <div className="show-pack-grid">{snapshots.map(snapshot => <ShowPackRow key={snapshot.id} snapshot={snapshot} onAdjust={onAdjust} onAdd={onAdd} onBreak={onBreak} />)}</div>
    )}
  </section>;
}

function ShowPackRow({ snapshot, onAdjust, onAdd, onBreak }: {
  snapshot: ShowPackSnapshot;
  onAdjust: (snapshot: ShowPackSnapshot, giveaways: number, damaged: number) => Promise<void>;
  onAdd: (snapshot: ShowPackSnapshot) => void;
  onBreak: (snapshot: ShowPackSnapshot) => void;
}) {
  const [giveaways, setGiveaways] = useState(String(snapshot.giveaways));
  const [damaged, setDamaged] = useState(String(snapshot.damaged));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setGiveaways(String(snapshot.giveaways)); setDamaged(String(snapshot.damaged)); }, [snapshot.giveaways, snapshot.damaged]);
  const current = snapshot.startingPacks + snapshot.addedPacks - snapshot.giveaways - snapshot.damaged;
  const dirty = Number(giveaways) !== snapshot.giveaways || Number(damaged) !== snapshot.damaged;
  return <article className="show-pack-card">
    <header><div><strong>{snapshot.packDisplayName}</strong><span>From {snapshot.sourceBoxProduct.name} · {money(snapshot.declaredValuePerPack)} declared · {money(snapshot.startingCostPerPack)} starting cost</span></div><b>{current}<small> current</small></b></header>
    <div className="show-pack-stats"><div><span>Started</span><strong>{snapshot.startingPacks}</strong></div><div><span>Added</span><strong>{snapshot.addedPacks}</strong></div><div><span>Cost Basis</span><strong>{money(Number(snapshot.startingCostBasis) + Number(snapshot.addedCostBasis))}</strong></div></div>
    <div className="show-pack-adjustments">
      <label><span>Giveaways</span><input type="number" min="0" step="1" value={giveaways} onChange={event => setGiveaways(event.target.value)} /></label>
      <label><span>Damaged</span><input type="number" min="0" step="1" value={damaged} onChange={event => setDamaged(event.target.value)} /></label>
      <button type="button" className="secondary-button" disabled={!dirty || saving || !Number.isSafeInteger(Number(giveaways)) || !Number.isSafeInteger(Number(damaged))} onClick={() => {
        setSaving(true);
        void onAdjust(snapshot, Number(giveaways), Number(damaged)).finally(() => setSaving(false));
      }}>{saving ? "Saving..." : "Save"}</button>
    </div>
    <footer><button type="button" className="secondary-button" onClick={() => onAdd(snapshot)}>Add Packs</button><button type="button" className="secondary-button" onClick={() => onBreak(snapshot)}>Break Down Box</button></footer>
  </article>;
}

function PackActionModal({ visitId, snapshot, type, onClose, onComplete }: {
  visitId: number;
  snapshot: ShowPackSnapshot;
  type: "ADD" | "BREAK";
  onClose: () => void;
  onComplete: (message: string) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState("1");
  const [available, setAvailable] = useState<number | null>(null);
  const [availableBoxes, setAvailableBoxes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        if (type === "ADD") {
          const response = await adminFetch("/api/shows/packs/available");
          if (!response.ok) throw new Error(await readApiError(response, "Available packs could not be loaded."));
          const products = (await response.json()) as AvailablePackProduct[];
          if (!cancelled) setAvailable(products.find(item => item.sourceBoxProductId === snapshot.sourceBoxProductId)?.availablePacks ?? 0);
        } else {
          const inventoryResponse = await adminFetch("/api/inventory");
          if (!inventoryResponse.ok) throw new Error("Source Box inventory could not be loaded.");
          const inventory = (await inventoryResponse.json()) as ShowInventoryItem[];
          if (!cancelled) setAvailableBoxes(inventory.find(row => row.productId === snapshot.sourceBoxProductId)?.unitsOnHand ?? 0);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Pack inventory could not be loaded.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [snapshot.sourceBoxProductId, type]);

  const max = type === "ADD" ? available ?? 0 : availableBoxes ?? 0;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > max) { setError(`Enter a quantity from 1 to ${max}.`); return; }
    try {
      setSaving(true); setError(null);
      const response = type === "ADD"
        ? await adminFetch(`/api/shows/visits/${visitId}/pack-snapshots/${snapshot.id}/add-existing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: amount }) })
        : await adminFetch("/api/pack-pools/break-down", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceBoxProductId: snapshot.sourceBoxProductId, quantityBoxes: amount, showVisitId: visitId }) });
      if (!response.ok) throw new Error(await readApiError(response, type === "ADD" ? "Packs could not be added." : "Box could not be broken down."));
      await onComplete(type === "ADD" ? `${amount} packs added to ${snapshot.packDisplayName}.` : `${amount} box${amount === 1 ? "" : "es"} converted and added to ${snapshot.packDisplayName}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pack action could not be completed."); setSaving(false); }
  }

  return <ModalShell title={type === "ADD" ? "Add Existing Packs" : "Break Down Box"} subtitle={snapshot.packDisplayName} onClose={onClose} maxWidth="520px">
    <form onSubmit={submit}><ModalBody>
      {loading ? <div className="show-inventory-empty">Loading inventory...</div> : type === "ADD" ? <>
        <div className="show-sale-reference"><div><span>Available Outside Show</span><strong>{available ?? 0}</strong></div><div><span>Current Show Packs</span><strong>{snapshot.startingPacks + snapshot.addedPacks - snapshot.giveaways - snapshot.damaged}</strong></div></div>
      </> : <div className="show-sale-reference"><div><span>Source Box</span><strong>{snapshot.sourceBoxProduct.name}</strong></div><div><span>Boxes Available</span><strong>{availableBoxes ?? 0}</strong></div></div>}
      {!loading && max > 0 && <FormField label={type === "ADD" ? "Packs to Add" : "Boxes to Break Down"}><input type="number" min="1" max={max} step="1" value={quantity} onChange={event => setQuantity(event.target.value)} style={inputStyle} /></FormField>}
      {error && <ErrorBox>{error}</ErrorBox>}
    </ModalBody><ModalFooter><SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton><button type="submit" className="primary-button" disabled={saving || loading || max <= 0}>{saving ? "Saving..." : type === "ADD" ? "Add Packs" : "Break Down Box"}</button></ModalFooter></form>
  </ModalShell>;
}

// ---------------------------------------------------------
// ACTIVE SHOW SEALED POS
// ---------------------------------------------------------

function ShowInventory({
  inventory,
  loading,
  onSell,
}: {
  inventory: ShowInventoryItem[];
  loading: boolean;
  onSell: (item: ShowInventoryItem) => void;
}) {
  return <section className="show-inventory">
    <SectionTitle title="Sell Sealed Inventory" subtitle="Select an in-stock product to record a Show sale." />
    {loading ? <div className="show-inventory-empty">Loading available inventory…</div>
      : inventory.length === 0 ? <div className="show-inventory-empty">No sealed inventory is currently available.</div>
      : <div className="show-inventory-grid">{inventory.map(item =>
        <button type="button" className="show-inventory-item" key={item.productId} onClick={() => onSell(item)}>
          <span className="show-inventory-name">{item.productName}<small>{item.itemId}</small></span>
          <span className="show-inventory-price"><small>Expected</small>{money(item.expectedSalePrice)}</span>
          <span className="show-inventory-stock"><strong>{item.unitsOnHand}</strong><small>available</small></span>
          <span className="show-inventory-sell">Sell</span>
        </button>
      )}</div>}
  </section>;
}

function QuickShowSaleModal({
  visit,
  item,
  onClose,
  onSold,
}: {
  visit: ShowVisit;
  item: ShowInventoryItem;
  onClose: () => void;
  onSold: (saleNumber: string) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(item.expectedSalePrice === null ? "" : String(item.expectedSalePrice));
  const [payment, setPayment] = useState<"CASH" | "DIGITAL">("CASH");
  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      try {
        const response = await adminFetch(`/api/inventory/${item.productId}`);
        if (!response.ok) throw new Error(await readApiError(response, "Inventory cost could not be loaded."));
        const data = (await response.json()) as InventoryDetail;
        if (!cancelled) setDetail(data);
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "Inventory cost could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadDetail();
    return () => { cancelled = true; };
  }, [item.productId]);

  const numericPrice = Number(price);
  const validPrice = price.trim() !== "" && Number.isFinite(numericPrice) && numericPrice >= 0;
  const saleTotal = validPrice ? quantity * numericPrice : 0;
  const currentLandedCost = detail?.batches.find(batch => batch.quantityRemaining > 0);
  let remaining = quantity;
  let estimatedCogs = 0;
  for (const batch of detail?.batches ?? []) {
    const used = Math.min(remaining, batch.quantityRemaining);
    estimatedCogs += used * Number(batch.landedUnitCost);
    remaining -= used;
    if (remaining === 0) break;
  }
  const estimatedProfit = saleTotal - estimatedCogs;
  const estimatedMargin = saleTotal > 0 ? estimatedProfit / saleTotal : 0;
  const belowCost = validPrice && currentLandedCost !== undefined && numericPrice < Number(currentLandedCost.landedUnitCost);
  const canSubmit = !loading && !saving && quantity > 0 && quantity <= item.unitsOnHand && validPrice && remaining === 0;

  function changeQuantity(next: number) {
    setQuantity(Math.max(0, Math.min(item.unitsOnHand, Number.isFinite(next) ? Math.trunc(next) : 0)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      setSaving(true);
      setError(null);
      const response = await adminFetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleDate: visit.visitDate.slice(0, 10),
          paymentMethod: payment,
          showVisitId: visit.id,
          notes: null,
          lines: [{ productId: item.productId, quantity, unitSalePrice: numericPrice }],
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Sale could not be saved.");
      await onSold(body.saleNumber ?? "Sale");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sale could not be saved.");
      setSaving(false);
    }
  }

  return <ModalShell title={`Sell ${item.productName}`} subtitle={`${visit.show.name} · ${item.unitsOnHand} currently available`} onClose={onClose} maxWidth="560px">
    <form onSubmit={submit}>
      <ModalBody>
        <div className="show-sale-reference">
          <div><span>Expected sale price</span><strong>{money(item.expectedSalePrice)}</strong></div>
          <div><span>Current landed cost / unit</span><strong>{loading ? "Loading…" : currentLandedCost ? money(currentLandedCost.landedUnitCost) : "—"}</strong></div>
        </div>
        <div className="show-sale-fields">
          <FormField label="Quantity">
            <div className="show-quantity-control">
              <button type="button" aria-label="Decrease quantity" onClick={() => changeQuantity(quantity - 1)}>−</button>
              <input type="number" min="0" max={item.unitsOnHand} step="1" value={quantity} onChange={event => changeQuantity(Number(event.target.value))} />
              <button type="button" aria-label="Increase quantity" onClick={() => changeQuantity(quantity + 1)}>+</button>
            </div>
          </FormField>
          <FormField label="Sale price per unit">
            <div className="show-price-input"><span>$</span><input type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></div>
          </FormField>
        </div>
        {belowCost && <div className="show-below-cost" role="status">Sale price is below the current FIFO landed cost. You can still confirm this sale.</div>}
        <div className="show-sale-totals">
          <div><span>Sale total</span><strong>{money(saleTotal)}</strong></div>
          <div><span>Estimated COGS</span><strong>{loading ? "—" : money(estimatedCogs)}</strong></div>
          <div><span>Estimated gross profit</span><strong className={estimatedProfit < 0 ? "is-negative" : ""}>{loading ? "—" : money(estimatedProfit)}</strong></div>
          <div><span>Estimated gross margin</span><strong className={estimatedMargin < 0 ? "is-negative" : ""}>{loading ? "—" : percent(estimatedMargin)}</strong></div>
        </div>
        <fieldset className="show-payment"><legend>Payment method</legend>{(["CASH", "DIGITAL"] as const).map(method =>
          <button key={method} type="button" aria-pressed={payment === method} className={payment === method ? "is-active" : ""} onClick={() => setPayment(method)}>{method === "CASH" ? "Cash" : "Digital"}</button>
        )}</fieldset>
        {error && <ErrorBox>{error}</ErrorBox>}
      </ModalBody>
      <ModalFooter>
        <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
        <button type="submit" className="primary-button" disabled={!canSubmit}>{saving ? "Recording Sale…" : `Confirm Sale — ${money(saleTotal)}`}</button>
      </ModalFooter>
    </form>
  </ModalShell>;
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

  const recentSales =
    [...(visitDetail?.sales ?? [])]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);

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
        title="Recent Show Sales"
        subtitle="Latest sealed transactions attached to this visit."
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
          {recentSales.map(
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
                      {new Date(sale.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      {" · "}
                      {sale.lines.map(line => line.product.name).join(", ")}
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
  packSnapshots,
  packEndingForms,
}: {
  visit: ShowVisit;

  performance:
    | VisitPerformance
    | null;

  endingForm: EndingSnapshotForm;
  packSnapshots: ShowPackSnapshot[];
  packEndingForms: Record<number, PackEndingForm>;
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
    <div className="show-review">
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

      {packSnapshots.length > 0 && <section className="show-pack-review">
        <div className="show-pack-heading"><div><h3>Pack Results</h3><p>Pack revenue posts to SEALED Funds only where Actual Revenue is entered.</p></div></div>
        <div className="table-scroll"><table className="report-table"><thead><tr><th>Pack</th><th>Start + Added</th><th>End</th><th>Giveaway / Damaged</th><th>Sold</th><th>Declared Sales</th><th>Actual Revenue</th><th>Cash / Digital</th></tr></thead><tbody>
          {packSnapshots.map(snapshot => {
            const form = packEndingForms[snapshot.id];
            const ending = Number(form?.endingPacks ?? 0);
            const sold = snapshot.startingPacks + snapshot.addedPacks - ending - snapshot.giveaways - snapshot.damaged;
            const actual = form?.actualRevenue.trim() ? Number(form.actualRevenue) : null;
            return <tr key={snapshot.id}><td><strong>{snapshot.packDisplayName}</strong><small>From {snapshot.sourceBoxProduct.name}</small></td><td>{snapshot.startingPacks} + {snapshot.addedPacks}</td><td>{ending}</td><td>{snapshot.giveaways} / {snapshot.damaged}</td><td><strong>{sold}</strong></td><td>{money(sold * Number(snapshot.declaredValuePerPack))}</td><td>{actual === null ? "Analytical only" : money(actual)}</td><td>{actual === null ? "—" : `${money(form.actualCashRevenue)} / ${money(form.actualDigitalRevenue)}`}</td></tr>;
          })}
        </tbody></table></div>
      </section>}

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
    </div>
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
      className="modal-backdrop show-modal-backdrop"
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
        className="modal-surface show-workspace" style={{maxWidth}}
      >
        <div
          className="show-workspace-header"
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
      className="show-workspace-body"
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
      className="show-workspace-footer"
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
      className={emphasized ? "show-metric is-emphasized" : "show-metric"}
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
      className="show-section-title"
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
      className="show-metric-grid"
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
      className={emphasized ? "show-metric is-emphasized" : "show-metric"}
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
