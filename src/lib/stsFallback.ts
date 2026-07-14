import oracleProspectsCsv from '../data/baseball_oracle_bowman_prospects.csv?raw'
import consensusHittersCsv from '../data/sts_formulated_consensus_hitters.csv?raw'
import consensusPitchersCsv from '../data/sts_formulated_consensus_pitchers.csv?raw'
import oopsyPeakMlbCsv from '../data/sts_oopsy_peak_mlb.csv?raw'

export const STS_FALLBACK_CSV_INPUTS = [oracleProspectsCsv, consensusHittersCsv, consensusPitchersCsv, oopsyPeakMlbCsv]
