import { useMemo, useState } from "react";
import { usePortfolio } from "../portfolio/usePortfolio";
import { SectorDonutChart } from "./SectorDonutChart";
import { SectorOverrideModal } from "./SectorOverrideModal";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";

export function SectorsTab() {
  const { file, setFile, liveByTicker } = usePortfolio();
  const [modalOpen, setModalOpen] = useState(false);

  const resolveSector = useMemo(
    () => createSectorResolver(SECTORS_DEFAULT, file?.sectors ?? {}),
    [file?.sectors]
  );

  const calculated = useMemo(() => {
    if (!file) return [];
    // liveByTicker comes from PortfolioContext (Task 22) — the same real merged
    // data Task 23's Portfolio tab uses, so the donut chart reflects actual
    // position values instead of always showing zero (there is no fresh fetch
    // here; this tab only reads the already-merged live state from context).
    return buildCalculatedPositions(file.positions, liveByTicker, resolveSector);
  }, [file, liveByTicker, resolveSector]);

  if (!file) return null;

  return (
    <div className="sectors-tab">
      <div className="sector-chart">
        <SectorDonutChart positions={calculated} />
      </div>
      <button type="button" onClick={() => setModalOpen(true)}>
        Изменить сектора
      </button>
      {modalOpen && (
        <SectorOverrideModal
          positions={file.positions}
          currentOverrides={file.sectors}
          resolveSector={resolveSector}
          onClose={() => setModalOpen(false)}
          onSave={(overrides) => {
            setFile({ ...file, sectors: { ...file.sectors, ...overrides } });
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
