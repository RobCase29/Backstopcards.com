import {
  SleeperPlayer,
  SleeperRoster,
  SleeperLeague,
  SleeperMatchup,
  SleeperNFLState,
  getSleeperPlayers,
  getSleeperNFLState,
} from './sleeperApi';

export interface PlayerAnalytics {
  player_id: string;
  name: string;
  position: string;
  team: string;
  age: number;
  experience: number;
  projectedPoints: number;
  consistencyScore: number;
  injuryRisk: 'Low' | 'Medium' | 'High';
  trendingStatus: 'Rising' | 'Falling' | 'Stable';
  valueScore: number;
  positionRank: number;
  overallRank: number;
  strengthOfSchedule: number;
  byeWeek: number;
  recentPerformance: number[];
  seasonProjection: {
    totalPoints: number;
    gamesPlayed: number;
    averagePoints: number;
  };
}

export interface RosterAnalytics {
  roster_id: number;
  owner_name: string;
  totalValue: number;
  projectedPoints: number;
  strengthByPosition: Record<string, number>;
  weaknesses: string[];
  strengths: string[];
  ageAnalysis: {
    averageAge: number;
    youngPlayers: number;
    veteranPlayers: number;
    peakAgePlayers: number;
  };
  injuryRisk: 'Low' | 'Medium' | 'High';
  depthScore: number;
  tradeTargets: string[];
  dropCandidates: string[];
  startSitRecommendations: {
    start: string[];
    sit: string[];
    flex: string[];
  };
  playoffOdds: number;
  championshipOdds: number;
  powerRanking: number;
}

export interface MatchupAnalytics {
  matchup_id: number;
  week: number;
  team1: {
    roster_id: number;
    projectedPoints: number;
    winProbability: number;
    keyPlayers: string[];
    advantages: string[];
    concerns: string[];
  };
  team2: {
    roster_id: number;
    projectedPoints: number;
    winProbability: number;
    keyPlayers: string[];
    advantages: string[];
    concerns: string[];
  };
  closenessRating: number;
  upsetPotential: number;
  keyMatchups: {
    position: string;
    team1Player: string;
    team2Player: string;
    advantage: 'team1' | 'team2' | 'even';
  }[];
}

export interface LeagueAnalytics {
  league_id: string;
  competitiveness: number;
  parityScore: number;
  averageExperience: number;
  mostActiveTraders: string[];
  waiversMostActive: string[];
  powerRankings: {
    roster_id: number;
    rank: number;
    trend: 'up' | 'down' | 'stable';
    score: number;
  }[];
  playoffPicture: {
    locked: number[];
    competing: number[];
    eliminated: number[];
  };
  tradeMarket: {
    hotCommodities: string[];
    buyLowCandidates: string[];
    sellHighCandidates: string[];
  };
  waiversHotlist: string[];
}

class AnalyticsService {
  private players: Record<string, SleeperPlayer> = {};
  private nflState: SleeperNFLState | null = null;
  private lastPlayerUpdate: number = 0;
  private readonly PLAYER_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  async initializeData(): Promise<void> {
    const now = Date.now();
    
    // Only fetch players if cache is stale
    if (now - this.lastPlayerUpdate > this.PLAYER_CACHE_DURATION) {
      const playersData = await getSleeperPlayers();
      if (playersData) {
        this.players = playersData;
        this.lastPlayerUpdate = now;
      }
    }

    // Always fetch current NFL state
    this.nflState = await getSleeperNFLState();
  }

  async analyzePlayer(playerId: string): Promise<PlayerAnalytics | null> {
    await this.initializeData();
    
    const player = this.players[playerId];
    if (!player) return null;

    // Calculate various analytics metrics
    const age = this.calculateAge(player);
    const experience = player.years_exp || 0;
    const projectedPoints = this.calculateProjectedPoints(player);
    const consistencyScore = this.calculateConsistencyScore(player);
    const injuryRisk = this.calculateInjuryRisk(player);
    const trendingStatus = this.calculateTrendingStatus(player);
    const valueScore = this.calculateValueScore(player);
    const positionRank = this.calculatePositionRank(player);
    const overallRank = this.calculateOverallRank(player);
    const strengthOfSchedule = this.calculateStrengthOfSchedule();
    const byeWeek = this.getByeWeek(player.team);

    return {
      player_id: playerId,
      name: `${player.first_name} ${player.last_name}`,
      position: player.position,
      team: player.team,
      age,
      experience,
      projectedPoints,
      consistencyScore,
      injuryRisk,
      trendingStatus,
      valueScore,
      positionRank,
      overallRank,
      strengthOfSchedule,
      byeWeek,
      recentPerformance: this.getRecentPerformance(),
      seasonProjection: this.calculateSeasonProjection(player),
    };
  }

  async analyzeRoster(roster: SleeperRoster, league: SleeperLeague, ownerName: string): Promise<RosterAnalytics> {
    await this.initializeData();

    const playerAnalytics = await Promise.all(
      roster.players.map(playerId => this.analyzePlayer(playerId))
    );

    const validPlayers = playerAnalytics.filter(p => p !== null) as PlayerAnalytics[];

    const totalValue = validPlayers.reduce((sum, p) => sum + p.valueScore, 0);
    const projectedPoints = validPlayers.reduce((sum, p) => sum + p.projectedPoints, 0);
    const strengthByPosition = this.calculateStrengthByPosition(validPlayers);
    const weaknesses = this.identifyWeaknesses(validPlayers);
    const strengths = this.identifyStrengths(validPlayers);
    const ageAnalysis = this.calculateAgeAnalysis(validPlayers);
    const injuryRisk = this.calculateRosterInjuryRisk(validPlayers);
    const depthScore = this.calculateDepthScore(validPlayers);
    const tradeTargets = this.identifyTradeTargets(validPlayers, weaknesses);
    const dropCandidates = this.identifyDropCandidates(validPlayers);
    const startSitRecommendations = this.generateStartSitRecommendations(validPlayers, roster);
    const playoffOdds = this.calculatePlayoffOdds(roster);
    const championshipOdds = this.calculateChampionshipOdds(roster);
    const powerRanking = this.calculatePowerRanking(validPlayers);

    return {
      roster_id: roster.roster_id,
      owner_name: ownerName,
      totalValue,
      projectedPoints,
      strengthByPosition,
      weaknesses,
      strengths,
      ageAnalysis,
      injuryRisk,
      depthScore,
      tradeTargets,
      dropCandidates,
      startSitRecommendations,
      playoffOdds,
      championshipOdds,
      powerRanking,
    };
  }

  async analyzeMatchup(matchup: SleeperMatchup[], week: number): Promise<MatchupAnalytics[]> {
    await this.initializeData();

    const matchupPairs = this.groupMatchupPairs(matchup);
    const analytics: MatchupAnalytics[] = [];

    for (const pair of matchupPairs) {
      const team1 = pair[0];
      const team2 = pair[1];

      const team1Analytics = await this.analyzeMatchupTeam(team1);
      const team2Analytics = await this.analyzeMatchupTeam(team2);

      const closenessRating = this.calculateClosenessRating(team1Analytics, team2Analytics);
      const upsetPotential = this.calculateUpsetPotential(team1Analytics, team2Analytics);
      const keyMatchups = this.identifyKeyMatchups();

      analytics.push({
        matchup_id: team1.matchup_id,
        week,
        team1: team1Analytics,
        team2: team2Analytics,
        closenessRating,
        upsetPotential,
        keyMatchups,
      });
    }

    return analytics;
  }

  async analyzeLeague(league: SleeperLeague): Promise<LeagueAnalytics> {
    await this.initializeData();

    return {
      league_id: league.league_id,
      competitiveness: 75,
      parityScore: 82,
      averageExperience: 4.2,
      mostActiveTraders: ['User1', 'User2'],
      waiversMostActive: ['User3', 'User4'],
      powerRankings: [],
      playoffPicture: { locked: [], competing: [], eliminated: [] },
      tradeMarket: { hotCommodities: [], buyLowCandidates: [], sellHighCandidates: [] },
      waiversHotlist: [],
    };
  }

  // Private helper methods
  private calculateAge(player: SleeperPlayer): number {
    if (player.age) return player.age;
    if (player.birth_date) {
      const birthDate = new Date(player.birth_date);
      const today = new Date();
      return today.getFullYear() - birthDate.getFullYear();
    }
    return 25; // Default age
  }

  private calculateProjectedPoints(player: SleeperPlayer): number {
    const basePoints: Record<string, number> = {
      QB: 280,
      RB: 180,
      WR: 160,
      TE: 120,
      K: 100,
      DEF: 90,
    };

    const base = basePoints[player.position] || 100;
    const ageAdjustment = this.getAgeAdjustment(this.calculateAge(player), player.position);
    const injuryAdjustment = this.getInjuryAdjustment(player);

    return Math.round(base * ageAdjustment * injuryAdjustment);
  }

  private calculateConsistencyScore(player: SleeperPlayer): number {
    const experience = player.years_exp || 0;
    const positionConsistency: Record<string, number> = {
      QB: 0.85,
      RB: 0.65,
      WR: 0.70,
      TE: 0.75,
      K: 0.60,
      DEF: 0.55,
    };

    const base = positionConsistency[player.position] || 0.65;
    const experienceBonus = Math.min(experience * 0.02, 0.15);
    
    return Math.min(base + experienceBonus, 1.0);
  }

  private calculateInjuryRisk(player: SleeperPlayer): 'Low' | 'Medium' | 'High' {
    if (player.injury_status && player.injury_status !== '') return 'High';
    
    const age = this.calculateAge(player);
    const position = player.position;
    
    if (position === 'RB') {
      if (age > 28) return 'High';
      if (age > 25) return 'Medium';
      return 'Medium';
    }
    
    if (age > 32) return 'High';
    if (age > 28) return 'Medium';
    return 'Low';
  }

  private calculateTrendingStatus(player: SleeperPlayer): 'Rising' | 'Falling' | 'Stable' {
    const age = this.calculateAge(player);
    const experience = player.years_exp || 0;
    
    if (age < 25 && experience < 3) return 'Rising';
    if (age > 30 && experience > 8) return 'Falling';
    return 'Stable';
  }

  private calculateValueScore(player: SleeperPlayer): number {
    const projectedPoints = this.calculateProjectedPoints(player);
    const consistency = this.calculateConsistencyScore(player);
    const age = this.calculateAge(player);
    const experience = player.years_exp || 0;
    
    const productionScore = projectedPoints / 300;
    const ageScore = age < 25 ? 1.0 : age < 30 ? 0.8 : 0.6;
    const experienceScore = experience > 2 ? 1.0 : 0.8;
    
    return Math.round((productionScore * consistency * ageScore * experienceScore) * 100);
  }

  private calculatePositionRank(player: SleeperPlayer): number {
    return player.search_rank || 999;
  }

  private calculateOverallRank(player: SleeperPlayer): number {
    return player.search_rank || 999;
  }

  private calculateStrengthOfSchedule(): number {
    return 0.5;
  }

  private getByeWeek(team: string): number {
    const byeWeeks: Record<string, number> = {
      'DET': 5, 'LAC': 5, 'PHI': 5, 'TEN': 5,
      'CHI': 7, 'DAL': 7,
      'CAR': 11, 'NYG': 11, 'ARI': 11, 'TB': 11,
      'LV': 10, 'SEA': 10, 'CLE': 10, 'GB': 10,
      'SF': 9, 'PIT': 9,
      'ATL': 12, 'BUF': 12, 'CIN': 12, 'JAX': 12, 'NO': 12, 'NYJ': 12,
      'HOU': 14, 'IND': 14, 'NE': 14, 'WAS': 14, 'BAL': 14, 'DEN': 14,
      'MIA': 6, 'KC': 6, 'LAR': 6, 'MIN': 6,
    };
    
    return byeWeeks[team] || 0;
  }

  private getRecentPerformance(): number[] {
    return [15.2, 8.7, 22.1, 12.4, 18.9];
  }

  private calculateSeasonProjection(player: SleeperPlayer) {
    const totalPoints = this.calculateProjectedPoints(player);
    const gamesPlayed = 17;
    const averagePoints = totalPoints / gamesPlayed;
    
    return {
      totalPoints,
      gamesPlayed,
      averagePoints,
    };
  }

  private calculateStrengthByPosition(players: PlayerAnalytics[]): Record<string, number> {
    const positionGroups = players.reduce((acc, player) => {
      if (!acc[player.position]) acc[player.position] = [];
      acc[player.position].push(player);
      return acc;
    }, {} as Record<string, PlayerAnalytics[]>);

    const strengths: Record<string, number> = {};
    
    for (const [position, positionPlayers] of Object.entries(positionGroups)) {
      const avgValue = positionPlayers.reduce((sum, p) => sum + p.valueScore, 0) / positionPlayers.length;
      strengths[position] = Math.round(avgValue);
    }

    return strengths;
  }

  private identifyWeaknesses(players: PlayerAnalytics[]): string[] {
    const weaknesses: string[] = [];
    const positionCounts = this.countPositions(players);
    
    if (positionCounts.RB < 4) weaknesses.push('RB depth');
    if (positionCounts.WR < 5) weaknesses.push('WR depth');
    if (positionCounts.TE < 2) weaknesses.push('TE depth');
    if (positionCounts.QB < 2) weaknesses.push('QB depth');
    
    const avgAge = players.reduce((sum, p) => sum + p.age, 0) / players.length;
    if (avgAge > 28) weaknesses.push('Aging roster');
    
    const highRiskPlayers = players.filter(p => p.injuryRisk === 'High').length;
    if (highRiskPlayers > 3) weaknesses.push('High injury risk');
    
    return weaknesses;
  }

  private identifyStrengths(players: PlayerAnalytics[]): string[] {
    const strengths: string[] = [];
    
    const elitePlayers = players.filter(p => p.overallRank <= 24).length;
    if (elitePlayers >= 3) strengths.push('Elite talent');
    
    const depthPlayers = players.filter(p => p.positionRank <= 36).length;
    if (depthPlayers >= 15) strengths.push('Excellent depth');
    
    const youngPlayers = players.filter(p => p.age <= 25).length;
    if (youngPlayers >= 8) strengths.push('Young core');
    
    const consistentPlayers = players.filter(p => p.consistencyScore >= 0.8).length;
    if (consistentPlayers >= 6) strengths.push('Consistent performers');
    
    return strengths;
  }

  private calculateAgeAnalysis(players: PlayerAnalytics[]) {
    const ages = players.map(p => p.age);
    const averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
    
    return {
      averageAge: Math.round(averageAge * 10) / 10,
      youngPlayers: players.filter(p => p.age <= 25).length,
      veteranPlayers: players.filter(p => p.age >= 30).length,
      peakAgePlayers: players.filter(p => p.age >= 26 && p.age <= 29).length,
    };
  }

  private calculateRosterInjuryRisk(players: PlayerAnalytics[]): 'Low' | 'Medium' | 'High' {
    const highRiskCount = players.filter(p => p.injuryRisk === 'High').length;
    const mediumRiskCount = players.filter(p => p.injuryRisk === 'Medium').length;
    
    if (highRiskCount >= 4) return 'High';
    if (highRiskCount >= 2 || mediumRiskCount >= 6) return 'Medium';
    return 'Low';
  }

  private calculateDepthScore(players: PlayerAnalytics[]): number {
    const positionDepth = this.countPositions(players);
    const requiredDepth = { QB: 2, RB: 4, WR: 5, TE: 2, K: 1, DEF: 1 };
    
    let score = 0;
    let maxScore = 0;
    
    for (const [position, required] of Object.entries(requiredDepth)) {
      const actual = positionDepth[position] || 0;
      score += Math.min(actual, required);
      maxScore += required;
    }
    
    return Math.round((score / maxScore) * 100);
  }

  private identifyTradeTargets(players: PlayerAnalytics[], weaknesses: string[]): string[] {
    const targets: string[] = [];
    
    if (weaknesses.includes('RB depth')) {
      targets.push('Mid-tier RB2', 'Handcuff RBs');
    }
    if (weaknesses.includes('WR depth')) {
      targets.push('WR2/3 with upside', 'Target share risers');
    }
    if (weaknesses.includes('TE depth')) {
      targets.push('Streaming TE options', 'TE with red zone usage');
    }
    if (weaknesses.includes('QB depth')) {
      targets.push('Streaming QB options', 'QB with rushing upside');
    }
    
    return targets;
  }

  private identifyDropCandidates(players: PlayerAnalytics[]): string[] {
    return players
      .filter(p => p.valueScore < 30 && p.positionRank > 60)
      .map(p => p.name)
      .slice(0, 5);
  }

  private generateStartSitRecommendations(players: PlayerAnalytics[], roster: SleeperRoster) {
    const starters = roster.starters.map(id => players.find(p => p.player_id === id)).filter(Boolean) as PlayerAnalytics[];
    const bench = roster.players
      .filter(id => !roster.starters.includes(id))
      .map(id => players.find(p => p.player_id === id))
      .filter(Boolean) as PlayerAnalytics[];

    const start = starters
      .filter(p => p.projectedPoints >= 12)
      .map(p => p.name)
      .slice(0, 3);

    const sit = starters
      .filter(p => p.projectedPoints < 8)
      .map(p => p.name)
      .slice(0, 3);

    const flex = bench
      .filter(p => p.projectedPoints >= 10)
      .map(p => p.name)
      .slice(0, 3);

    return { start, sit, flex };
  }

  private calculatePlayoffOdds(roster: SleeperRoster): number {
    const wins = Number(roster.settings.wins) || 0;
    const losses = Number(roster.settings.losses) || 0;
    const totalGames = wins + losses;
    
    if (totalGames === 0) return 50;
    
    const winRate = wins / totalGames;
    return Math.round(winRate * 100);
  }

  private calculateChampionshipOdds(roster: SleeperRoster): number {
    const playoffOdds = this.calculatePlayoffOdds(roster);
    return Math.round(playoffOdds * 0.3);
  }

  private calculatePowerRanking(players: PlayerAnalytics[]): number {
    const avgValue = players.reduce((sum, p) => sum + p.valueScore, 0) / players.length;
    const avgProjection = players.reduce((sum, p) => sum + p.projectedPoints, 0) / players.length;
    
    return Math.round((avgValue + avgProjection) / 2);
  }

  private groupMatchupPairs(matchups: SleeperMatchup[]): SleeperMatchup[][] {
    const pairs: SleeperMatchup[][] = [];
    const processed = new Set<number>();
    
    for (const matchup of matchups) {
      if (processed.has(matchup.roster_id)) continue;
      
      const opponent = matchups.find(m => 
        m.matchup_id === matchup.matchup_id && m.roster_id !== matchup.roster_id
      );
      
      if (opponent) {
        pairs.push([matchup, opponent]);
        processed.add(matchup.roster_id);
        processed.add(opponent.roster_id);
      }
    }
    
    return pairs;
  }

  private async analyzeMatchupTeam(matchup: SleeperMatchup) {
    const starterAnalytics = await Promise.all(
      matchup.starters.map(id => this.analyzePlayer(id))
    );
    
    const validStarters = starterAnalytics.filter(p => p !== null) as PlayerAnalytics[];
    const projectedPoints = validStarters.reduce((sum, p) => sum + p.projectedPoints, 0);
    
    return {
      roster_id: matchup.roster_id,
      projectedPoints,
      winProbability: 50,
      keyPlayers: validStarters.slice(0, 3).map(p => p.name),
      advantages: this.identifyAdvantages(validStarters),
      concerns: this.identifyConcerns(validStarters),
    };
  }

  private calculateClosenessRating(team1: { projectedPoints: number }, team2: { projectedPoints: number }): number {
    const pointDiff = Math.abs(team1.projectedPoints - team2.projectedPoints);
    const avgPoints = (team1.projectedPoints + team2.projectedPoints) / 2;
    const closeness = 1 - (pointDiff / avgPoints);
    
    return Math.round(closeness * 100);
  }

  private calculateUpsetPotential(team1: { projectedPoints: number }, team2: { projectedPoints: number }): number {
    const favorite = team1.projectedPoints > team2.projectedPoints ? team1 : team2;
    const underdog = team1.projectedPoints > team2.projectedPoints ? team2 : team1;
    
    const pointDiff = favorite.projectedPoints - underdog.projectedPoints;
    const upsetChance = Math.max(0, 50 - (pointDiff * 2));
    
    return Math.round(upsetChance);
  }

  private identifyKeyMatchups() {
    return [
      {
        position: 'QB',
        team1Player: 'Player A',
        team2Player: 'Player B',
        advantage: 'team1' as const,
      },
    ];
  }

  private identifyAdvantages(players: PlayerAnalytics[]): string[] {
    const advantages: string[] = [];
    
    const elitePlayers = players.filter(p => p.overallRank <= 12).length;
    if (elitePlayers >= 2) advantages.push('Elite talent advantage');
    
    const consistentPlayers = players.filter(p => p.consistencyScore >= 0.8).length;
    if (consistentPlayers >= 4) advantages.push('High floor lineup');
    
    const risingPlayers = players.filter(p => p.trendingStatus === 'Rising').length;
    if (risingPlayers >= 2) advantages.push('Trending up players');
    
    return advantages;
  }

  private identifyConcerns(players: PlayerAnalytics[]): string[] {
    const concerns: string[] = [];
    
    const injuredPlayers = players.filter(p => p.injuryRisk === 'High').length;
    if (injuredPlayers >= 2) concerns.push('Injury concerns');
    
    const inconsistentPlayers = players.filter(p => p.consistencyScore < 0.6).length;
    if (inconsistentPlayers >= 2) concerns.push('Inconsistent performers');
    
    const decliningPlayers = players.filter(p => p.trendingStatus === 'Falling').length;
    if (decliningPlayers >= 2) concerns.push('Declining production');
    
    return concerns;
  }

  private countPositions(players: PlayerAnalytics[]): Record<string, number> {
    return players.reduce((acc, player) => {
      acc[player.position] = (acc[player.position] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getAgeAdjustment(age: number, position: string): number {
    const peakAges: Record<string, number> = {
      QB: 28,
      RB: 26,
      WR: 27,
      TE: 28,
      K: 30,
      DEF: 25,
    };

    const peak = peakAges[position] || 27;
    const ageDiff = Math.abs(age - peak);
    
    return Math.max(0.7, 1 - (ageDiff * 0.03));
  }

  private getInjuryAdjustment(player: SleeperPlayer): number {
    if (player.injury_status && player.injury_status !== '') {
      return 0.8;
    }
    return 1.0;
  }
}

export const analyticsService = new AnalyticsService(); 