// Generated from contracts/gravity/GravityExpression.g4 by ANTLR 4.13.2
// noinspection ES6UnusedImports,JSUnusedGlobalSymbols,JSUnusedLocalSymbols
import {
	ATN,
	ATNDeserializer,
	CharStream,
	DecisionState, DFA,
	Lexer,
	LexerATNSimulator,
	RuleContext,
	PredictionContextCache,
	Token
} from "antlr4";
export default class GravityExpressionLexer extends Lexer {
	public static readonly T__0 = 1;
	public static readonly T__1 = 2;
	public static readonly T__2 = 3;
	public static readonly T__3 = 4;
	public static readonly T__4 = 5;
	public static readonly T__5 = 6;
	public static readonly T__6 = 7;
	public static readonly T__7 = 8;
	public static readonly T__8 = 9;
	public static readonly T__9 = 10;
	public static readonly T__10 = 11;
	public static readonly T__11 = 12;
	public static readonly T__12 = 13;
	public static readonly CRITERION = 14;
	public static readonly POSTURE_REF = 15;
	public static readonly NUMBER = 16;
	public static readonly COMPARATOR = 17;
	public static readonly IDENT = 18;
	public static readonly WS = 19;
	public static readonly EOF = Token.EOF;

	public static readonly channelNames: string[] = [ "DEFAULT_TOKEN_CHANNEL", "HIDDEN" ];
	public static readonly literalNames: (string | null)[] = [ null, "'constraint'", 
                                                            "'threshold'", 
                                                            "'evidence'", 
                                                            "'min'", "'priority'", 
                                                            "'for'", "'escalation'", 
                                                            "'to'", "'exception'", 
                                                            "'of'", "'on'", 
                                                            "','", "'over'" ];
	public static readonly symbolicNames: (string | null)[] = [ null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             "CRITERION", 
                                                             "POSTURE_REF", 
                                                             "NUMBER", "COMPARATOR", 
                                                             "IDENT", "WS" ];
	public static readonly modeNames: string[] = [ "DEFAULT_MODE", ];

	public static readonly ruleNames: string[] = [
		"T__0", "T__1", "T__2", "T__3", "T__4", "T__5", "T__6", "T__7", "T__8", 
		"T__9", "T__10", "T__11", "T__12", "CRITERION", "POSTURE_REF", "NUMBER", 
		"COMPARATOR", "IDENT", "WS",
	];


	constructor(input: CharStream) {
		super(input);
		this._interp = new LexerATNSimulator(this, GravityExpressionLexer._ATN, GravityExpressionLexer.DecisionsToDFA, new PredictionContextCache());
	}

	public get grammarFileName(): string { return "GravityExpression.g4"; }

	public get literalNames(): (string | null)[] { return GravityExpressionLexer.literalNames; }
	public get symbolicNames(): (string | null)[] { return GravityExpressionLexer.symbolicNames; }
	public get ruleNames(): string[] { return GravityExpressionLexer.ruleNames; }

	public get serializedATN(): number[] { return GravityExpressionLexer._serializedATN; }

	public get channelNames(): string[] { return GravityExpressionLexer.channelNames; }

	public get modeNames(): string[] { return GravityExpressionLexer.modeNames; }

	public static readonly _serializedATN: number[] = [4,0,19,182,6,-1,2,0,
	7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,6,2,7,7,7,2,8,7,8,2,9,
	7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,13,2,14,7,14,2,15,7,15,2,16,7,
	16,2,17,7,17,2,18,7,18,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1,
	1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,
	1,3,1,3,1,3,1,3,1,4,1,4,1,4,1,4,1,4,1,4,1,4,1,4,1,4,1,5,1,5,1,5,1,5,1,6,
	1,6,1,6,1,6,1,6,1,6,1,6,1,6,1,6,1,6,1,6,1,7,1,7,1,7,1,8,1,8,1,8,1,8,1,8,
	1,8,1,8,1,8,1,8,1,8,1,9,1,9,1,9,1,10,1,10,1,10,1,11,1,11,1,12,1,12,1,12,
	1,12,1,12,1,13,1,13,1,13,1,13,5,13,128,8,13,10,13,12,13,131,9,13,1,13,1,
	13,1,14,1,14,1,14,1,14,1,14,1,14,4,14,141,8,14,11,14,12,14,142,1,15,4,15,
	146,8,15,11,15,12,15,147,1,15,1,15,4,15,152,8,15,11,15,12,15,153,3,15,156,
	8,15,1,16,1,16,1,16,1,16,1,16,1,16,1,16,1,16,1,16,3,16,167,8,16,1,17,1,
	17,5,17,171,8,17,10,17,12,17,174,9,17,1,18,4,18,177,8,18,11,18,12,18,178,
	1,18,1,18,1,129,0,19,1,1,3,2,5,3,7,4,9,5,11,6,13,7,15,8,17,9,19,10,21,11,
	23,12,25,13,27,14,29,15,31,16,33,17,35,18,37,19,1,0,6,4,0,48,57,65,90,95,
	95,97,122,1,0,48,57,2,0,60,60,62,62,2,0,65,90,97,122,4,0,45,57,65,90,95,
	95,97,122,3,0,9,10,13,13,32,32,192,0,1,1,0,0,0,0,3,1,0,0,0,0,5,1,0,0,0,
	0,7,1,0,0,0,0,9,1,0,0,0,0,11,1,0,0,0,0,13,1,0,0,0,0,15,1,0,0,0,0,17,1,0,
	0,0,0,19,1,0,0,0,0,21,1,0,0,0,0,23,1,0,0,0,0,25,1,0,0,0,0,27,1,0,0,0,0,
	29,1,0,0,0,0,31,1,0,0,0,0,33,1,0,0,0,0,35,1,0,0,0,0,37,1,0,0,0,1,39,1,0,
	0,0,3,50,1,0,0,0,5,60,1,0,0,0,7,69,1,0,0,0,9,73,1,0,0,0,11,82,1,0,0,0,13,
	86,1,0,0,0,15,97,1,0,0,0,17,100,1,0,0,0,19,110,1,0,0,0,21,113,1,0,0,0,23,
	116,1,0,0,0,25,118,1,0,0,0,27,123,1,0,0,0,29,134,1,0,0,0,31,145,1,0,0,0,
	33,166,1,0,0,0,35,168,1,0,0,0,37,176,1,0,0,0,39,40,5,99,0,0,40,41,5,111,
	0,0,41,42,5,110,0,0,42,43,5,115,0,0,43,44,5,116,0,0,44,45,5,114,0,0,45,
	46,5,97,0,0,46,47,5,105,0,0,47,48,5,110,0,0,48,49,5,116,0,0,49,2,1,0,0,
	0,50,51,5,116,0,0,51,52,5,104,0,0,52,53,5,114,0,0,53,54,5,101,0,0,54,55,
	5,115,0,0,55,56,5,104,0,0,56,57,5,111,0,0,57,58,5,108,0,0,58,59,5,100,0,
	0,59,4,1,0,0,0,60,61,5,101,0,0,61,62,5,118,0,0,62,63,5,105,0,0,63,64,5,
	100,0,0,64,65,5,101,0,0,65,66,5,110,0,0,66,67,5,99,0,0,67,68,5,101,0,0,
	68,6,1,0,0,0,69,70,5,109,0,0,70,71,5,105,0,0,71,72,5,110,0,0,72,8,1,0,0,
	0,73,74,5,112,0,0,74,75,5,114,0,0,75,76,5,105,0,0,76,77,5,111,0,0,77,78,
	5,114,0,0,78,79,5,105,0,0,79,80,5,116,0,0,80,81,5,121,0,0,81,10,1,0,0,0,
	82,83,5,102,0,0,83,84,5,111,0,0,84,85,5,114,0,0,85,12,1,0,0,0,86,87,5,101,
	0,0,87,88,5,115,0,0,88,89,5,99,0,0,89,90,5,97,0,0,90,91,5,108,0,0,91,92,
	5,97,0,0,92,93,5,116,0,0,93,94,5,105,0,0,94,95,5,111,0,0,95,96,5,110,0,
	0,96,14,1,0,0,0,97,98,5,116,0,0,98,99,5,111,0,0,99,16,1,0,0,0,100,101,5,
	101,0,0,101,102,5,120,0,0,102,103,5,99,0,0,103,104,5,101,0,0,104,105,5,
	112,0,0,105,106,5,116,0,0,106,107,5,105,0,0,107,108,5,111,0,0,108,109,5,
	110,0,0,109,18,1,0,0,0,110,111,5,111,0,0,111,112,5,102,0,0,112,20,1,0,0,
	0,113,114,5,111,0,0,114,115,5,110,0,0,115,22,1,0,0,0,116,117,5,44,0,0,117,
	24,1,0,0,0,118,119,5,111,0,0,119,120,5,118,0,0,120,121,5,101,0,0,121,122,
	5,114,0,0,122,26,1,0,0,0,123,124,5,58,0,0,124,125,5,58,0,0,125,129,1,0,
	0,0,126,128,9,0,0,0,127,126,1,0,0,0,128,131,1,0,0,0,129,130,1,0,0,0,129,
	127,1,0,0,0,130,132,1,0,0,0,131,129,1,0,0,0,132,133,5,0,0,1,133,28,1,0,
	0,0,134,135,5,103,0,0,135,136,5,114,0,0,136,137,5,118,0,0,137,138,5,95,
	0,0,138,140,1,0,0,0,139,141,7,0,0,0,140,139,1,0,0,0,141,142,1,0,0,0,142,
	140,1,0,0,0,142,143,1,0,0,0,143,30,1,0,0,0,144,146,7,1,0,0,145,144,1,0,
	0,0,146,147,1,0,0,0,147,145,1,0,0,0,147,148,1,0,0,0,148,155,1,0,0,0,149,
	151,5,46,0,0,150,152,7,1,0,0,151,150,1,0,0,0,152,153,1,0,0,0,153,151,1,
	0,0,0,153,154,1,0,0,0,154,156,1,0,0,0,155,149,1,0,0,0,155,156,1,0,0,0,156,
	32,1,0,0,0,157,158,5,60,0,0,158,167,5,61,0,0,159,160,5,62,0,0,160,167,5,
	61,0,0,161,162,5,61,0,0,162,167,5,61,0,0,163,164,5,33,0,0,164,167,5,61,
	0,0,165,167,7,2,0,0,166,157,1,0,0,0,166,159,1,0,0,0,166,161,1,0,0,0,166,
	163,1,0,0,0,166,165,1,0,0,0,167,34,1,0,0,0,168,172,7,3,0,0,169,171,7,4,
	0,0,170,169,1,0,0,0,171,174,1,0,0,0,172,170,1,0,0,0,172,173,1,0,0,0,173,
	36,1,0,0,0,174,172,1,0,0,0,175,177,7,5,0,0,176,175,1,0,0,0,177,178,1,0,
	0,0,178,176,1,0,0,0,178,179,1,0,0,0,179,180,1,0,0,0,180,181,6,18,0,0,181,
	38,1,0,0,0,9,0,129,142,147,153,155,166,172,178,1,6,0,0];

	private static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!GravityExpressionLexer.__ATN) {
			GravityExpressionLexer.__ATN = new ATNDeserializer().deserialize(GravityExpressionLexer._serializedATN);
		}

		return GravityExpressionLexer.__ATN;
	}


	static DecisionsToDFA = GravityExpressionLexer._ATN.decisionToState.map( (ds: DecisionState, index: number) => new DFA(ds, index) );
}