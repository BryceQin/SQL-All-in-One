import { AvoidSelectStarRule } from './AvoidSelectStarRule'
import { ExplicitJoinTypeRule } from './ExplicitJoinTypeRule'
import { LimitWithOrderByRule } from './LimitWithOrderByRule'
import { ColumnCountMismatchRule } from './ColumnCountMismatchRule'
import { MissingPrimaryKeyRule } from './MissingPrimaryKeyRule'
import { SelectInInsertRule } from './SelectInInsertRule'
import { DuplicateColumnAliasesRule } from './DuplicateColumnAliasesRule'
import { UseCoalesceOverIsNullRule } from './UseCoalesceOverIsNullRule'
import { UseCurrentTimestampRule } from './UseCurrentTimestampRule'
import { AvoidCorrelatedSubqueriesRule } from './AvoidCorrelatedSubqueriesRule'
import { MissingQueryCommentRule } from './MissingQueryCommentRule'
import { MissingColumnCommentRule } from './MissingColumnCommentRule'
import { CommentedOutCodeRule } from './CommentedOutCodeRule'
import { ExpiredTodoRule } from './ExpiredTodoRule'
import { HavingWithoutGroupByRule } from './HavingWithoutGroupByRule'
import { LimitInvalidValueRule } from './LimitInvalidValueRule'
import { ReservedWordIdentifierRule } from './ReservedWordIdentifierRule'
import { JoinMissingOnRule } from './JoinMissingOnRule'
import { SelectWithoutFromRule } from './SelectWithoutFromRule'
import { MisplacedDistinctRule } from './MisplacedDistinctRule'
import { AggregateInWhereRule } from './AggregateInWhereRule'
import { SubqueryWithoutAliasRule } from './SubqueryWithoutAliasRule'
import { SuspiciousNullComparisonRule } from './SuspiciousNullComparisonRule'
import { IncompleteCaseRule } from './IncompleteCaseRule'
import { RedundantDistinctRule } from './RedundantDistinctRule'
import { DateFunctionUsageRule } from './DateFunctionUsageRule'
import { WildcardInUpdateRule } from './WildcardInUpdateRule'
import type { LintRule } from './LintRule'
import type { LintRuleConfig } from '../lintRules'

export interface RuleConstructor {
  new (config: LintRuleConfig): LintRule;
}

export const RULES: { [key: string]: RuleConstructor } = {
  'avoid_select_star': AvoidSelectStarRule,
  'explicit_join_type': ExplicitJoinTypeRule,
  'limit_with_order_by': LimitWithOrderByRule,
  'avoid_column_count_mismatch': ColumnCountMismatchRule,
  'missing_primary_key': MissingPrimaryKeyRule,
  'avoid_select_in_insert': SelectInInsertRule,
  'duplicate_column_aliases': DuplicateColumnAliasesRule,
  'use_coalesce_over_isnull': UseCoalesceOverIsNullRule,
  'use_current_timestamp': UseCurrentTimestampRule,
  'avoid_correlated_subqueries': AvoidCorrelatedSubqueriesRule,
  'missing_query_comment': MissingQueryCommentRule,
  'missing_column_comment': MissingColumnCommentRule,
  'commented_out_code': CommentedOutCodeRule,
  'expired_todo': ExpiredTodoRule,
  'having_without_group_by': HavingWithoutGroupByRule,
  'limit_invalid_value': LimitInvalidValueRule,
  'reserved_word_identifier': ReservedWordIdentifierRule,
  'join_missing_on': JoinMissingOnRule,
  'select_without_from': SelectWithoutFromRule,
  'misplaced_distinct': MisplacedDistinctRule,
  'aggregate_in_where': AggregateInWhereRule,
  'subquery_without_alias': SubqueryWithoutAliasRule,
  'suspicious_null_comparison': SuspiciousNullComparisonRule,
  'incomplete_case': IncompleteCaseRule,
  'redundant_distinct': RedundantDistinctRule,
  'date_function_usage': DateFunctionUsageRule,
  'wildcard_in_update': WildcardInUpdateRule,
} as const;

export type RuleKey = keyof typeof RULES;
