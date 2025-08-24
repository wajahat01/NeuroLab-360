/**
 * Supabase API Service
 * Direct REST API calls to Supabase without Flask backend
 */

import { supabase } from '../lib/supabase';
import { API_CONFIG, SUPABASE_TABLES, buildSupabaseUrl, getSupabaseHeaders } from '../config/api';

class SupabaseApiService {
  constructor() {
    this.baseUrl = API_CONFIG.SUPABASE_REST_URL;
  }

  // Generic fetch method for Supabase REST API
  async fetchSupabase(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      filters = {},
      queryOptions = {},
      includeAuth = true,
    } = options;

    try {
      const url = buildSupabaseUrl(endpoint, filters, queryOptions);
      const headers = getSupabaseHeaders(includeAuth, method);

      const fetchOptions = {
        method,
        headers,
        ...(body && { body: JSON.stringify(body) }),
      };

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
        status: response.status,
      };
    } catch (error) {
      console.error('Supabase API Error:', error);
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  // Dashboard Methods
  async getDashboardSummary(userId) {
    try {
      // Get experiments count
      const experimentsResult = await this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENTS}`, {
        filters: { user_id: `eq.${userId}` },
        queryOptions: { select: 'id' },
      });

      // Get recent results count
      const resultsResult = await this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENT_RESULTS}`, {
        filters: { user_id: `eq.${userId}` },
        queryOptions: { 
          select: 'id',
          order: 'created_at.desc',
          limit: '30'
        },
      });

      if (experimentsResult.success && resultsResult.success) {
        return {
          success: true,
          data: {
            total_experiments: experimentsResult.data.length,
            total_results: resultsResult.data.length,
            active_experiments: experimentsResult.data.length, // Simplified
            completion_rate: resultsResult.data.length > 0 ? 85 : 0, // Mock calculation
          },
        };
      }

      throw new Error('Failed to fetch dashboard summary');
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  async getDashboardCharts(userId, period = '30d', experimentType = null) {
    try {
      // Calculate date filter based on period
      const daysAgo = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      const filters = {
        user_id: `eq.${userId}`,
        created_at: `gte.${startDate.toISOString()}`,
      };

      if (experimentType) {
        filters.experiment_type = `eq.${experimentType}`;
      }

      const result = await this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENT_RESULTS}`, {
        filters,
        queryOptions: {
          select: 'created_at,score,experiment_type',
          order: 'created_at.asc',
        },
      });

      if (result.success) {
        // Process data for charts
        const chartData = this.processChartData(result.data, period);
        return {
          success: true,
          data: chartData,
        };
      }

      throw new Error('Failed to fetch chart data');
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  async getRecentExperiments(userId, limit = 10, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const result = await this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENTS}`, {
        filters: {
          user_id: `eq.${userId}`,
          created_at: `gte.${startDate.toISOString()}`,
        },
        queryOptions: {
          select: 'id,name,experiment_type,status,created_at,updated_at',
          order: 'created_at.desc',
          limit: limit.toString(),
        },
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }

  // Experiment Methods
  async getExperiments(userId, filters = {}) {
    const queryFilters = {
      user_id: `eq.${userId}`,
      ...filters,
    };

    return this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENTS}`, {
      filters: queryFilters,
      queryOptions: {
        select: '*',
        order: 'created_at.desc',
      },
    });
  }

  async getExperiment(id, userId) {
    return this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENTS}`, {
      filters: {
        id: `eq.${id}`,
        user_id: `eq.${userId}`,
      },
      queryOptions: {
        select: '*',
      },
    });
  }

  async createExperiment(experimentData, userId) {
    const data = {
      ...experimentData,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENTS}`, {
      method: 'POST',
      body: data,
    });
  }

  async updateExperiment(id, experimentData, userId) {
    const data = {
      ...experimentData,
      updated_at: new Date().toISOString(),
    };

    return this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENTS}`, {
      method: 'PATCH',
      body: data,
      filters: {
        id: `eq.${id}`,
        user_id: `eq.${userId}`,
      },
    });
  }

  async deleteExperiment(id, userId) {
    return this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENTS}`, {
      method: 'DELETE',
      filters: {
        id: `eq.${id}`,
        user_id: `eq.${userId}`,
      },
    });
  }

  // Experiment Results Methods
  async getExperimentResults(experimentId, userId) {
    return this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENT_RESULTS}`, {
      filters: {
        experiment_id: `eq.${experimentId}`,
        user_id: `eq.${userId}`,
      },
      queryOptions: {
        select: '*',
        order: 'created_at.desc',
      },
    });
  }

  async createExperimentResult(resultData, userId) {
    const data = {
      ...resultData,
      user_id: userId,
      created_at: new Date().toISOString(),
    };

    return this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENT_RESULTS}`, {
      method: 'POST',
      body: data,
    });
  }

  // Helper method to process chart data
  processChartData(rawData, period) {
    // Group data by date
    const groupedData = rawData.reduce((acc, item) => {
      const date = new Date(item.created_at).toDateString();
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(item);
      return acc;
    }, {});

    // Convert to chart format
    const chartData = Object.entries(groupedData).map(([date, items]) => ({
      date,
      count: items.length,
      averageScore: items.reduce((sum, item) => sum + (item.score || 0), 0) / items.length,
      experiments: items,
    }));

    return {
      timeline: chartData,
      summary: {
        totalResults: rawData.length,
        averageScore: rawData.reduce((sum, item) => sum + (item.score || 0), 0) / rawData.length,
        period,
      },
    };
  }

  // Health check method
  async healthCheck() {
    try {
      const result = await this.fetchSupabase(`/${SUPABASE_TABLES.EXPERIMENTS}`, {
        queryOptions: {
          select: 'id',
          limit: '1',
        },
        includeAuth: false,
      });

      return {
        success: result.success,
        status: result.success ? 'healthy' : 'error',
        message: result.success ? 'Supabase connection successful' : result.error,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
export const supabaseApi = new SupabaseApiService();
export default supabaseApi;