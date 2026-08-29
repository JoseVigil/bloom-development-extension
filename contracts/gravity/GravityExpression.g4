grammar GravityExpression;

expression
    : constraintExpr EOF
    | thresholdExpr EOF
    | evidenceExpr EOF
    | priorityExpr EOF
    | escalationExpr EOF
    | exceptionExpr EOF
    ;

constraintExpr
    : 'constraint' targetList? criterion
    ;

thresholdExpr
    : 'threshold' IDENT COMPARATOR quantity criterion?
    ;

evidenceExpr
    : 'evidence' ('min' NUMBER IDENT)? criterion
    ;

priorityExpr
    : 'priority' priorityOrder ('for' IDENT)? criterion?
    ;

escalationExpr
    : 'escalation' 'to' IDENT ('for' IDENT)? criterion?
    ;

exceptionExpr
    : 'exception' 'of' RULE_REF criterion
    ;

criterion
    : CRITERION
    ;

targetList
    : 'on' IDENT (',' IDENT)*
    ;

priorityOrder
    : IDENT 'over' IDENT (',' IDENT 'over' IDENT)*
    ;

quantity
    : NUMBER IDENT?
    ;

// CRITERION deliberately consumes everything from :: through EOF. Its body
// is never tokenized; wrappers remove the delimiter and trim only its edges.
CRITERION
    : '::' .*? EOF
    ;

RULE_REF
    : 'grv_' [A-Za-z0-9_]+
    ;

NUMBER
    : [0-9]+ ('.' [0-9]+)?
    ;

COMPARATOR
    : '<=' | '>=' | '==' | '!=' | '<' | '>'
    ;

IDENT
    : [A-Za-z] [A-Za-z0-9_./-]*
    ;

WS
    : [ \t\r\n]+ -> skip
    ;
