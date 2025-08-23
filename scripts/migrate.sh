#!/bin/bash

# Database Migration Script for NeuroLab 360
# Handles database schema migrations and rollbacks

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[MIGRATE]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    print_warning "Supabase CLI not found. Using manual migration approach."
    MANUAL_MODE=true
else
    MANUAL_MODE=false
fi

# Migration functions
run_migration() {
    local migration_file=$1
    local migration_name=$(basename "$migration_file" .sql)
    
    print_status "Running migration: $migration_name"
    
    if [ "$MANUAL_MODE" = true ]; then
        print_warning "Please run the following SQL manually in your Supabase dashboard:"
        echo "----------------------------------------"
        cat "$migration_file"
        echo "----------------------------------------"
        read -p "Press Enter after running the migration manually..."
    else
        supabase db push --include-all
    fi
    
    print_status "Migration $migration_name completed"
}

# Main migration logic
case "${1:-up}" in
    "up")
        print_status "Running all pending migrations..."
        
        # Run migrations in order
        for migration in supabase/migrations/*.sql; do
            if [ -f "$migration" ]; then
                run_migration "$migration"
            fi
        done
        
        print_status "All migrations completed successfully!"
        ;;
        
    "down")
        print_error "Migration rollback not implemented yet"
        print_warning "Please manually revert changes if needed"
        exit 1
        ;;
        
    "status")
        print_status "Checking migration status..."
        
        if [ "$MANUAL_MODE" = true ]; then
            print_warning "Manual mode - cannot check migration status automatically"
            echo "Available migrations:"
            ls -la supabase/migrations/
        else
            supabase migration list
        fi
        ;;
        
    "create")
        if [ -z "$2" ]; then
            print_error "Please provide a migration name: ./scripts/migrate.sh create add_new_feature"
            exit 1
        fi
        
        migration_name=$2
        timestamp=$(date +%Y%m%d%H%M%S)
        migration_file="supabase/migrations/${timestamp}_${migration_name}.sql"
        
        cat > "$migration_file" << EOF
-- Migration: $migration_name
-- Created: $(date +%Y-%m-%d)
-- Description: Add description here

-- Add your SQL statements here

EOF
        
        print_status "Created migration file: $migration_file"
        ;;
        
    "help"|*)
        echo "NeuroLab 360 Database Migration Script"
        echo ""
        echo "Usage: ./scripts/migrate.sh [command]"
        echo ""
        echo "Commands:"
        echo "  up      - Run all pending migrations (default)"
        echo "  down    - Rollback last migration (not implemented)"
        echo "  status  - Show migration status"
        echo "  create  - Create new migration file"
        echo "  help    - Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./scripts/migrate.sh up"
        echo "  ./scripts/migrate.sh create add_user_preferences"
        echo "  ./scripts/migrate.sh status"
        ;;
esac