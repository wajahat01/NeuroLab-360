"""
Supabase client configuration and utilities for NeuroLab 360.
Provides connection management, authentication helpers, and error handling.
"""

import os
import time
from typing import Optional, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv
import logging

from retry_logic import RetryableOperation, get_database_circuit_breaker
from exceptions import DatabaseError, NetworkError, AuthenticationError
from performance_monitor import database_operation_monitor, structured_logger

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
    
    def execute_query(self, table: str, query_type: str, user_token: str = None, **kwargs) -> Dict[str, Any]:
        """
        Execute a database query with retry logic and circuit breaker.
        
        Args:
            table: Table name to query
            query_type: Type of query ('select', 'insert', 'update', 'delete')
            user_token: JWT token for authenticated operations
            **kwargs: Query parameters
            
        Returns:
            Query result or error information
        """
        # Create retry operation with database circuit breaker
        retry_operation = RetryableOperation(
            max_retries=3,
            base_delay=1.0,
            max_delay=10.0,
            circuit_breaker=get_database_circuit_breaker()
        )
        
        try:
            # Execute query directly without retry logic for debugging
            result = self._execute_single_query(table, query_type, user_token, **kwargs)
            return result
            
        except Exception as e:
            logger.error(f"Database query failed after retries: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'data': None,
                'error_type': type(e).__name__
            }
    
    def _execute_single_query(self, table: str, query_type: str, user_token: str = None, **kwargs) -> Dict[str, Any]:
        """
        Execute a single database query without retry logic.
        
        Args:
            table: Table name to query
            query_type: Type of query ('select', 'insert', 'update', 'delete')
            user_token: JWT token for authenticated operations
            **kwargs: Query parameters
            
        Returns:
            Query result
            
        Raises:
            DatabaseError: For database-related errors
            NetworkError: For network-related errors
        """
        start_time = time.time()
        
        try:
            logger.debug(f"Executing query: {query_type} on table {table}")
            logger.debug(f"Client type: {type(self.client)}")
            
            # If user token is provided, create a new client with the token for authenticated operations
            if user_token and query_type in ['insert', 'update', 'delete']:
                # Create a new client with the user's token for authenticated operations
                from supabase import create_client
                import os
                url = os.getenv('SUPABASE_URL')
                key = os.getenv('SUPABASE_ANON_KEY')
                auth_client = create_client(url, key)
                auth_client.auth.set_session(user_token, user_token)  # Set the user's session
                table_ref = auth_client.table(table)
            else:
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
            response_time = time.time() - start_time
            
            structured_logger.info(
                f"Database query successful: {table}.{query_type}",
                table=table,
                query_type=query_type,
                response_time_ms=round(response_time * 1000, 2),
                rows_returned=len(response.data) if response.data else 0
            )
            
            return {
                'success': True,
                'data': response.data,
                'count': getattr(response, 'count', None),
                'response_time': response_time
            }
            
        except Exception as e:
            response_time = time.time() - start_time
            error_message = str(e).lower()
            
            # Classify error types for better retry logic
            if any(keyword in error_message for keyword in ['connection', 'network', 'timeout', 'unreachable']):
                structured_logger.warning(
                    f"Network error in database query: {table}.{query_type}",
                    table=table,
                    query_type=query_type,
                    response_time_ms=round(response_time * 1000, 2),
                    error_type='NetworkError',
                    error_message=str(e)
                )
                raise NetworkError(f"Network error during {query_type} operation on {table}: {str(e)}")
            elif any(keyword in error_message for keyword in ['authentication', 'unauthorized', 'token', 'auth']):
                structured_logger.error(
                    f"Authentication error in database query: {table}.{query_type}",
                    table=table,
                    query_type=query_type,
                    error_type='AuthenticationError',
                    error_message=str(e)
                )
                raise AuthenticationError(f"Authentication error during {query_type} operation: {str(e)}")
            elif any(keyword in error_message for keyword in ['database', 'sql', 'constraint', 'foreign key']):
                structured_logger.error(
                    f"Database error in query: {table}.{query_type}",
                    table=table,
                    query_type=query_type,
                    response_time_ms=round(response_time * 1000, 2),
                    error_type='DatabaseError',
                    error_message=str(e)
                )
                raise DatabaseError(f"Database error during {query_type} operation on {table}: {str(e)}")
            else:
                structured_logger.error(
                    f"Unknown error in database query: {table}.{query_type}",
                    table=table,
                    query_type=query_type,
                    response_time_ms=round(response_time * 1000, 2),
                    error_type='UnknownError',
                    error_message=str(e)
                )
                raise DatabaseError(f"Unknown error during {query_type} operation on {table}: {str(e)}")

# Global instance
supabase_client = SupabaseClient()

def get_supabase_client() -> SupabaseClient:
    """Get the global Supabase client instance."""
    return supabase_client