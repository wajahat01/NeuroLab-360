"""
Supabase client configuration and utilities for NeuroLab 360.
Provides connection management, authentication helpers, and error handling.
"""

import os
from typing import Optional, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SupabaseClient:
    """Singleton Supabase client with connection management and utilities."""
    
    _instance: Optional['SupabaseClient'] = None
    _client: Optional[Client] = None
    
    def __new__(cls) -> 'SupabaseClient':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            self._initialize_client()
    
    def _initialize_client(self) -> None:
        """Initialize the Supabase client with environment configuration."""
        try:
            url = os.getenv('SUPABASE_URL')
            key = os.getenv('SUPABASE_ANON_KEY')
            
            if not url or not key:
                raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables")
            
            self._client = create_client(url, key)
            logger.info("Supabase client initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {str(e)}")
            raise
    
    @property
    def client(self) -> Client:
        """Get the Supabase client instance."""
        if self._client is None:
            self._initialize_client()
        return self._client
    
    def get_user_from_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Extract user information from JWT token.
        
        Args:
            token: JWT token from Authorization header
            
        Returns:
            User information dict or None if invalid
        """
        try:
            # Remove 'Bearer ' prefix if present
            if token.startswith('Bearer '):
                token = token[7:]
            
            response = self.client.auth.get_user(token)
            return response.user.dict() if response.user else None
            
        except Exception as e:
            logger.error(f"Failed to get user from token: {str(e)}")
            return None
    
    def verify_user_access(self, user_id: str, resource_user_id: str) -> bool:
        """
        Verify that a user has access to a specific resource.
        
        Args:
            user_id: ID of the requesting user
            resource_user_id: ID of the user who owns the resource
            
        Returns:
            True if access is allowed, False otherwise
        """
        return user_id == resource_user_id
    
    def execute_query(self, table: str, query_type: str, **kwargs) -> Dict[str, Any]:
        """
        Execute a database query with error handling.
        
        Args:
            table: Table name to query
            query_type: Type of query ('select', 'insert', 'update', 'delete')
            **kwargs: Query parameters
            
        Returns:
            Query result or error information
        """
        try:
            table_ref = self.client.table(table)
            
            if query_type == 'select':
                query = table_ref.select(kwargs.get('columns', '*'))
                if 'filters' in kwargs:
                    for filter_item in kwargs['filters']:
                        query = query.eq(filter_item['column'], filter_item['value'])
                if 'order' in kwargs:
                    query = query.order(kwargs['order'])
                if 'limit' in kwargs:
                    query = query.limit(kwargs['limit'])
                    
            elif query_type == 'insert':
                query = table_ref.insert(kwargs.get('data', {}))
                
            elif query_type == 'update':
                query = table_ref.update(kwargs.get('data', {}))
                if 'filters' in kwargs:
                    for filter_item in kwargs['filters']:
                        query = query.eq(filter_item['column'], filter_item['value'])
                        
            elif query_type == 'delete':
                query = table_ref.delete()
                if 'filters' in kwargs:
                    for filter_item in kwargs['filters']:
                        query = query.eq(filter_item['column'], filter_item['value'])
            else:
                raise ValueError(f"Unsupported query type: {query_type}")
            
            response = query.execute()
            return {
                'success': True,
                'data': response.data,
                'count': getattr(response, 'count', None)
            }
            
        except Exception as e:
            logger.error(f"Database query failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'data': None
            }

# Global instance
supabase_client = SupabaseClient()

def get_supabase_client() -> SupabaseClient:
    """Get the global Supabase client instance."""
    return supabase_client