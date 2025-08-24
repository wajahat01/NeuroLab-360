s
from enum import Enum

class LogLevel(Enum):
    """Log level enumeration."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

@dataclass
class LogEntry:
    """Structured log entry representation."""
    timestamp: datetime
    level: LogLevel
    message: str
    correlation_id: Optional[str] = None
    request_id: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None
    duration_ms: Optional[float] = None
    user_id: Optional[str] = None
    error_type: Optional[str] = None
    operation: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None

class LogParser:
    """Parser for structured log entries."""
    
    def __init__(self):
        self.json_pattern = re.compile(r'\{.*\}')
        self.timestamp_pattern = re.compile(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)')
    
    def parse_log_line(self, line: str) -> Optional[LogEntry]:
        """Parse a single log line into a LogEntry."""
        try:
            # Try to extract JSON from the log line
            json_match = self.json_pattern.search(line)
            if json_match:
                json_data = json.loads(json_match.group())
                return self._parse_json_log(json_data)
            else:
                # Fallback to parsing standard log format
                return self._parse_standard_log(line)
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            # Return None for unparseable lines
            return None
    
    def _parse_json_log(self, data: Dict[str, Any]) -> LogEntry:
        """Parse structured JSON log entry."""
        timestamp_str = data.get('timestamp', '')
        timestamp = self._parse_timestamp(timestamp_str)
        
        level_str = data.get('level', 'INFO')
        level = LogLevel(level_str) if level_str in [l.value for l in LogLevel] else LogLevel.INFO
        
        return LogEntry(
            timestamp=timestamp,
            level=level,
            message=data.get('message', ''),
            correlation_id=data.get('correlation_id'),
            request_id=data.get('request_id'),
            endpoint=data.get('endpoint'),
            method=data.get('method'),
            status_code=data.get('status_code'),
            duration_ms=data.get('duration_ms'),
            user_id=data.get('user_id'),
            error_type=data.get('error_type'),
            operation=data.get('operation'),
            raw_data=data
        )
    
    def _parse_standard_log(self, line: str) -> Optional[LogEntry]:
        """Parse standard log format as fallback."""
        # Extract timestamp
        timestamp_match = self.timestamp_pattern.search(line)
        if not timestamp_match:
            return None
        
        timestamp = self._parse_timestamp(timestamp_match.group(1))
        
        # Extract log level
        level = LogLevel.INFO
        for log_level in LogLevel:
            if log_level.value in line:
                level = log_level
                break
        
        # Extract message (everything after the log level)
        message_parts = line.split(' - ')
        message = message_parts[-1] if len(message_parts) > 1 else line
        
        return LogEntry(
            timestamp=timestamp,
            level=level,
            message=message.strip(),
            raw_data={'original_line': line}
        )
    
    def _parse_timestamp(self, timestamp_str: str) -> datetime:
        """Parse timestamp string into datetime object."""
        # Handle various timestamp formats
        formats = [
            '%Y-%m-%dT%H:%M:%S.%fZ',
            '%Y-%m-%dT%H:%M:%SZ',
            '%Y-%m-%dT%H:%M:%S.%f',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%d %H:%M:%S'
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(timestamp_str.replace('Z', ''), fmt.replace('Z', ''))
            except ValueError:
                continue
        
        # Fallback to current time if parsing fails
        return datetime.utcnow()
    
    def parse_log_file(self, file_path: str) -> List[LogEntry]:
        """Parse entire log file into LogEntry objects."""
        entries = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    entry = self.parse_log_line(line.strip())
                    if entry:
                        entries.append(entry)
        except FileNotFoundError:
            raise FileNotFoundError(f"Log file not found: {file_path}")
        except Exception as e:
            raise Exception(f"Error reading log file {file_path}: {str(e)}")
        
        return entries

class LogAnalyzer:
    """Analyzer for log entries with various analysis capabilities."""
    
    def __init__(self, entries: List[LogEntry]):
        self.entries = entries
        self.entries_by_time = sorted(entries, key=lambda x: x.timestamp)
    
    def get_error_analysis(self, time_window_hours: int = 24) -> Dict[str, Any]:
        """Analyze errors within a time window."""
        cutoff_time = datetime.utcnow() - timedelta(hours=time_window_hours)
        recent_errors = [
            entry for entry in self.entries 
            if entry.level in [LogLevel.ERROR, LogLevel.CRITICAL] and entry.timestamp >= cutoff_time
        ]
        
        error_types = Counter()
        error_endpoints = Counter()
        error_operations = Counter()
        error_timeline = defaultdict(int)
        
        for error in recent_errors:
            # Count by error type
            if error.error_type:
                error_types[error.error_type] += 1
            
            # Count by endpoint
            if error.endpoint:
                error_endpoints[error.endpoint] += 1
            
            # Count by operation
            if error.operation:
                error_operations[error.operation] += 1
            
            # Timeline (hourly buckets)
            hour_bucket = error.timestamp.replace(minute=0, second=0, microsecond=0)
            error_timeline[hour_bucket.isoformat()] += 1
        
        return {
            'total_errors': len(recent_errors),
            'time_window_hours': time_window_hours,
            'error_types': dict(error_types.most_common(10)),
            'error_endpoints': dict(error_endpoints.most_common(10)),
            'error_operations': dict(error_operations.most_common(10)),
            'error_timeline': dict(error_timeline),
            'error_rate_per_hour': len(recent_errors) / time_window_hours if time_window_hours > 0 else 0
        }
    
    def get_performance_analysis(self, time_window_hours: int = 24) -> Dict[str, Any]:
        """Analyze performance metrics within a time window."""
        cutoff_time = datetime.utcnow() - timedelta(hours=time_window_hours)
        performance_entries = [
            entry for entry in self.entries 
            if entry.duration_ms is not None and entry.timestamp >= cutoff_time
        ]
        
        if not performance_entries:
            return {
                'total_requests': 0,
                'time_window_hours': time_window_hours,
                'message': 'No performance data available for the specified time window'
            }
        
        # Group by endpoint
        endpoint_performance = defaultdict(list)
        for entry in performance_entries:
            endpoint = entry.endpoint or 'unknown'
            endpoint_performance[endpoint].append(entry.duration_ms)
        
        # Calculate statistics for each endpoint
        endpoint_stats = {}
        for endpoint, durations in endpoint_performance.items():
            endpoint_stats[endpoint] = {
                'request_count': len(durations),
                'avg_duration_ms': round(statistics.mean(durations), 2),
                'min_duration_ms': round(min(durations), 2),
                'max_duration_ms': round(max(durations), 2),
                'median_duration_ms': round(statistics.median(durations), 2)
            }
            
            # Add percentiles if we have enough data
            if len(durations) >= 10:
                sorted_durations = sorted(durations)
                endpoint_stats[endpoint]['p95_duration_ms'] = round(
                    sorted_durations[int(len(sorted_durations) * 0.95)], 2
                )
                endpoint_stats[endpoint]['p99_duration_ms'] = round(
                    sorted_durations[int(len(sorted_durations) * 0.99)], 2
                )
        
        # Overall statistics
        all_durations = [entry.duration_ms for entry in performance_entries]
        
        return {
            'total_requests': len(performance_entries),
            'time_window_hours': time_window_hours,
            'overall_stats': {
                'avg_duration_ms': round(statistics.mean(all_durations), 2),
                'min_duration_ms': round(min(all_durations), 2),
                'max_duration_ms': round(max(all_durations), 2),
                'median_duration_ms': round(statistics.median(all_durations), 2)
            },
            'endpoint_stats': endpoint_stats,
            'slow_requests': [
                {
                    'endpoint': entry.endpoint,
                    'duration_ms': entry.duration_ms,
                    'timestamp': entry.timestamp.isoformat(),
                    'correlation_id': entry.correlation_id
                }
                for entry in sorted(performance_entries, key=lambda x: x.duration_ms, reverse=True)[:10]
            ]
        }
    
    def get_user_activity_analysis(self, time_window_hours: int = 24) -> Dict[str, Any]:
        """Analyze user activity patterns."""
        cutoff_time = datetime.utcnow() - timedelta(hours=time_window_hours)
        user_entries = [
            entry for entry in self.entries 
            if entry.user_id and entry.timestamp >= cutoff_time
        ]
        
        user_activity = defaultdict(lambda: {
            'request_count': 0,
            'endpoints': set(),
            'first_seen': None,
            'last_seen': None,
            'errors': 0
        })
        
        for entry in user_entries:
            user_id = entry.user_id
            activity = user_activity[user_id]
            
            activity['request_count'] += 1
            if entry.endpoint:
                activity['endpoints'].add(entry.endpoint)
            
            if activity['first_seen'] is None or entry.timestamp < activity['first_seen']:
                activity['first_seen'] = entry.timestamp
            
            if activity['last_seen'] is None or entry.timestamp > activity['last_seen']:
                activity['last_seen'] = entry.timestamp
            
            if entry.level in [LogLevel.ERROR, LogLevel.CRITICAL]:
                activity['errors'] += 1
        
        # Convert to serializable format
        user_stats = {}
        for user_id, activity in user_activity.items():
            user_stats[user_id] = {
                'request_count': activity['request_count'],
                'unique_endpoints': len(activity['endpoints']),
                'endpoints': list(activity['endpoints']),
                'first_seen': activity['first_seen'].isoformat() if activity['first_seen'] else None,
                'last_seen': activity['last_seen'].isoformat() if activity['last_seen'] else None,
                'errors': activity['errors'],
                'error_rate': round((activity['errors'] / activity['request_count']) * 100, 2) if activity['request_count'] > 0 else 0
            }
        
        return {
            'total_users': len(user_stats),
            'time_window_hours': time_window_hours,
            'user_stats': user_stats,
            'most_active_users': sorted(
                user_stats.items(), 
                key=lambda x: x[1]['request_count'], 
                reverse=True
            )[:10]
        }
    
    def get_correlation_analysis(self, correlation_id: str) -> Dict[str, Any]:
        """Analyze all log entries for a specific correlation ID."""
        correlated_entries = [
            entry for entry in self.entries 
            if entry.correlation_id == correlation_id
        ]
        
        if not correlated_entries:
            return {
                'correlation_id': correlation_id,
                'entries_found': 0,
                'message': 'No entries found for this correlation ID'
            }
        
        # Sort by timestamp
        correlated_entries.sort(key=lambda x: x.timestamp)
        
        # Calculate request duration if we have start and end
        total_duration = None
        if len(correlated_entries) >= 2:
            start_time = correlated_entries[0].timestamp
            end_time = correlated_entries[-1].timestamp
            total_duration = (end_time - start_time).total_seconds() * 1000
        
        # Extract key information
        endpoints = set()
        operations = set()
        errors = []
        
        for entry in correlated_entries:
            if entry.endpoint:
                endpoints.add(entry.endpoint)
            if entry.operation:
                operations.add(entry.operation)
            if entry.level in [LogLevel.ERROR, LogLevel.CRITICAL]:
                errors.append({
                    'timestamp': entry.timestamp.isoformat(),
                    'message': entry.message,
                    'error_type': entry.error_type
                })
        
        return {
            'correlation_id': correlation_id,
            'entries_found': len(correlated_entries),
            'start_time': correlated_entries[0].timestamp.isoformat(),
            'end_time': correlated_entries[-1].timestamp.isoformat(),
            'total_duration_ms': round(total_duration, 2) if total_duration else None,
            'endpoints': list(endpoints),
            'operations': list(operations),
            'errors': errors,
            'has_errors': len(errors) > 0,
            'entries': [
                {
                    'timestamp': entry.timestamp.isoformat(),
                    'level': entry.level.value,
                    'message': entry.message,
                    'endpoint': entry.endpoint,
                    'operation': entry.operation,
                    'duration_ms': entry.duration_ms
                }
                for entry in correlated_entries
            ]
        }
    
    def generate_summary_report(self, time_window_hours: int = 24) -> Dict[str, Any]:
        """Generate comprehensive log analysis summary."""
        cutoff_time = datetime.utcnow() - timedelta(hours=time_window_hours)
        recent_entries = [
            entry for entry in self.entries 
            if entry.timestamp >= cutoff_time
        ]
        
        if not recent_entries:
            return {
                'time_window_hours': time_window_hours,
                'message': 'No log entries found for the specified time window'
            }
        
        # Basic statistics
        level_counts = Counter(entry.level for entry in recent_entries)
        endpoint_counts = Counter(entry.endpoint for entry in recent_entries if entry.endpoint)
        
        return {
            'analysis_timestamp': datetime.utcnow().isoformat(),
            'time_window_hours': time_window_hours,
            'total_entries': len(recent_entries),
            'level_distribution': {level.value: count for level, count in level_counts.items()},
            'top_endpoints': dict(endpoint_counts.most_common(10)),
            'error_analysis': self.get_error_analysis(time_window_hours),
            'performance_analysis': self.get_performance_analysis(time_window_hours),
            'user_activity': self.get_user_activity_analysis(time_window_hours)
        }

class LogReporter:
    """Generate formatted reports from log analysis."""
    
    @staticmethod
    def generate_text_report(analysis: Dict[str, Any]) -> str:
        """Generate human-readable text report."""
        report_lines = []
        report_lines.append("=" * 60)
        report_lines.append("LOG ANALYSIS REPORT")
        report_lines.append("=" * 60)
        report_lines.append(f"Generated: {analysis.get('analysis_timestamp', 'Unknown')}")
        report_lines.append(f"Time Window: {analysis.get('time_window_hours', 'Unknown')} hours")
        report_lines.append(f"Total Entries: {analysis.get('total_entries', 0)}")
        report_lines.append("")
        
        # Level distribution
        if 'level_distribution' in analysis:
            report_lines.append("LOG LEVEL DISTRIBUTION:")
            for level, count in analysis['level_distribution'].items():
                report_lines.append(f"  {level}: {count}")
            report_lines.append("")
        
        # Top endpoints
        if 'top_endpoints' in analysis:
            report_lines.append("TOP ENDPOINTS:")
            for endpoint, count in analysis['top_endpoints'].items():
                report_lines.append(f"  {endpoint}: {count} requests")
            report_lines.append("")
        
        # Error analysis
        if 'error_analysis' in analysis:
            error_data = analysis['error_analysis']
            report_lines.append("ERROR ANALYSIS:")
            report_lines.append(f"  Total Errors: {error_data.get('total_errors', 0)}")
            report_lines.append(f"  Error Rate: {error_data.get('error_rate_per_hour', 0):.2f} errors/hour")
            
            if error_data.get('error_types'):
                report_lines.append("  Top Error Types:")
                for error_type, count in error_data['error_types'].items():
                    report_lines.append(f"    {error_type}: {count}")
            report_lines.append("")
        
        # Performance analysis
        if 'performance_analysis' in analysis:
            perf_data = analysis['performance_analysis']
            if 'overall_stats' in perf_data:
                stats = perf_data['overall_stats']
                report_lines.append("PERFORMANCE ANALYSIS:")
                report_lines.append(f"  Total Requests: {perf_data.get('total_requests', 0)}")
                report_lines.append(f"  Average Duration: {stats.get('avg_duration_ms', 0):.2f}ms")
                report_lines.append(f"  Max Duration: {stats.get('max_duration_ms', 0):.2f}ms")
                report_lines.append("")
        
        return "\n".join(report_lines)
    
    @staticmethod
    def generate_json_report(analysis: Dict[str, Any]) -> str:
        """Generate JSON report."""
        return json.dumps(analysis, indent=2, default=str)

# Utility functions for common log analysis tasks
def analyze_log_file(file_path: str, time_window_hours: int = 24) -> Dict[str, Any]:
    """Convenience function to analyze a log file."""
    parser = LogParser()
    entries = parser.parse_log_file(file_path)
    analyzer = LogAnalyzer(entries)
    return analyzer.generate_summary_report(time_window_hours)

def find_correlation_trace(file_path: str, correlation_id: str) -> Dict[str, Any]:
    """Convenience function to trace a correlation ID through logs."""
    parser = LogParser()
    entries = parser.parse_log_file(file_path)
    analyzer = LogAnalyzer(entries)
    return analyzer.get_correlation_analysis(correlation_id)