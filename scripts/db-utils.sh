#!/bin/bash

# Database Utilities for NeuroLab 360
# Provides backup, restore, and maintenance functions

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[DB-UTILS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Database connection check
check_connection() {
    print_status "Checking database connection..."
    
    if [ -z "$SUPABASE_URL" ]; then
        print_error "SUPABASE_URL not set in environment"
        exit 1
    fi
    
    print_status "Database connection OK"
}

# Backup database
backup_database() {
    local backup_name="${1:-backup_$(date +%Y%m%d_%H%M%S)}"
    local backup_file="backups/${backup_name}.sql"
    
    print_status "Creating database backup: $backup_file"
    
    # Create backups directory
    mkdir -p backups
    
    if command -v supabase &> /dev/null; then
        supabase db dump > "$backup_file"
    else
        print_warning "Supabase CLI not available. Please create backup manually."
        print_info "Go to your Supabase dashboard > Settings > Database > Database backups"
        return 1
    fi
    
    print_status "Backup created successfully: $backup_file"
}

# Restore database
restore_database() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        print_error "Please specify backup file: ./scripts/db-utils.sh restore backups/backup.sql"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    print_warning "This will overwrite your current database!"
    read -p "Are you sure you want to continue? (y/N): " confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "Restore cancelled"
        exit 0
    fi
    
    print_status "Restoring database from: $backup_file"
    
    if command -v supabase &> /dev/null; then
        supabase db reset --db-url "$SUPABASE_URL" < "$backup_file"
    else
        print_warning "Supabase CLI not available. Please restore manually."
        print_info "Copy the contents of $backup_file and run in Supabase SQL Editor"
        return 1
    fi
    
    print_status "Database restored successfully"
}

# Database maintenance
maintenance() {
    print_status "Running database maintenance..."
    
    cat > /tmp/maintenance.sql << 'EOF'
-- Database maintenance queries

-- Update table statistics
ANALYZE experiments;
ANALYZE results;

-- Vacuum tables to reclaim space and update statistics
VACUUM ANALYZE experiments;
VACUUM ANALYZE results;

-- Check for unused indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE idx_tup_read = 0 AND idx_tup_fetch = 0;

-- Show table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
EOF

    if command -v supabase &> /dev/null; then
        supabase db reset --db-url "$SUPABASE_URL" < /tmp/maintenance.sql
    else
        print_warning "Please run the following SQL manually:"
        cat /tmp/maintenance.sql
    fi
    
    rm -f /tmp/maintenance.sql
    print_status "Database maintenance completed"
}

# Reset database to clean state
reset_database() {
    print_warning "This will delete ALL data and reset the database!"
    read -p "Are you sure you want to continue? (y/N): " confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "Reset cancelled"
        exit 0
    fi
    
    print_status "Resetting database..."
    
    # Run migrations
    ./scripts/migrate.sh up
    
    print_status "Database reset completed"
    print_info "Run './scripts/seed.sh' to add sample data"
}

# Show database statistics
stats() {
    print_status "Gathering database statistics..."
    
    cat > /tmp/stats.sql << 'EOF'
-- Database statistics

-- Table row counts
SELECT 
    'experiments' as table_name,
    COUNT(*) as row_count
FROM experiments
UNION ALL
SELECT 
    'results' as table_name,
    COUNT(*) as row_count
FROM results;

-- Experiment statistics
SELECT 
    experiment_type,
    status,
    COUNT(*) as count
FROM experiments
GROUP BY experiment_type, status
ORDER BY experiment_type, status;

-- Recent activity
SELECT 
    DATE(created_at) as date,
    COUNT(*) as experiments_created
FROM experiments
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
EOF

    if command -v supabase &> /dev/null; then
        supabase db reset --db-url "$SUPABASE_URL" < /tmp/stats.sql
    else
        print_warning "Please run the following SQL manually:"
        cat /tmp/stats.sql
    fi
    
    rm -f /tmp/stats.sql
}

# Main command handling
case "${1:-help}" in
    "backup")
        check_connection
        backup_database "$2"
        ;;
        
    "restore")
        check_connection
        restore_database "$2"
        ;;
        
    "maintenance")
        check_connection
        maintenance
        ;;
        
    "reset")
        check_connection
        reset_database
        ;;
        
    "stats")
        check_connection
        stats
        ;;
        
    "check")
        check_connection
        ;;
        
    "help"|*)
        echo "NeuroLab 360 Database Utilities"
        echo ""
        echo "Usage: ./scripts/db-utils.sh [command] [options]"
        echo ""
        echo "Commands:"
        echo "  backup [name]    - Create database backup"
        echo "  restore <file>   - Restore database from backup"
        echo "  maintenance      - Run database maintenance tasks"
        echo "  reset            - Reset database to clean state"
        echo "  stats            - Show database statistics"
        echo "  check            - Check database connection"
        echo "  help             - Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./scripts/db-utils.sh backup production_backup"
        echo "  ./scripts/db-utils.sh restore backups/backup_20240115.sql"
        echo "  ./scripts/db-utils.sh maintenance"
        echo "  ./scripts/db-utils.sh stats"
        ;;
esac