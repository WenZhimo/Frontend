"use strict";
var JSChessEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/types/board.types.js
  var require_board_types = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/types/board.types.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.InternalColor = exports.Piece = void 0;
      var Piece;
      (function(Piece2) {
        Piece2[Piece2["EMPTY"] = 0] = "EMPTY";
        Piece2[Piece2["WHITE_PAWN"] = 1] = "WHITE_PAWN";
        Piece2[Piece2["WHITE_KNIGHT"] = 2] = "WHITE_KNIGHT";
        Piece2[Piece2["WHITE_BISHOP"] = 3] = "WHITE_BISHOP";
        Piece2[Piece2["WHITE_ROOK"] = 4] = "WHITE_ROOK";
        Piece2[Piece2["WHITE_QUEEN"] = 5] = "WHITE_QUEEN";
        Piece2[Piece2["WHITE_KING"] = 6] = "WHITE_KING";
        Piece2[Piece2["BLACK_PAWN"] = 7] = "BLACK_PAWN";
        Piece2[Piece2["BLACK_KNIGHT"] = 8] = "BLACK_KNIGHT";
        Piece2[Piece2["BLACK_BISHOP"] = 9] = "BLACK_BISHOP";
        Piece2[Piece2["BLACK_ROOK"] = 10] = "BLACK_ROOK";
        Piece2[Piece2["BLACK_QUEEN"] = 11] = "BLACK_QUEEN";
        Piece2[Piece2["BLACK_KING"] = 12] = "BLACK_KING";
      })(Piece || (exports.Piece = Piece = {}));
      var InternalColor;
      (function(InternalColor2) {
        InternalColor2[InternalColor2["WHITE"] = 0] = "WHITE";
        InternalColor2[InternalColor2["BLACK"] = 1] = "BLACK";
      })(InternalColor || (exports.InternalColor = InternalColor = {}));
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/types/move.types.js
  var require_move_types = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/types/move.types.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.MoveOrderType = exports.CastlingType = exports.PromotionPiece = exports.MoveFlag = void 0;
      var MoveFlag;
      (function(MoveFlag2) {
        MoveFlag2[MoveFlag2["NONE"] = 0] = "NONE";
        MoveFlag2[MoveFlag2["EN_PASSANT"] = 1] = "EN_PASSANT";
        MoveFlag2[MoveFlag2["CASTLING"] = 2] = "CASTLING";
        MoveFlag2[MoveFlag2["PROMOTION"] = 4] = "PROMOTION";
        MoveFlag2[MoveFlag2["PAWN_DOUBLE_PUSH"] = 8] = "PAWN_DOUBLE_PUSH";
        MoveFlag2[MoveFlag2["CAPTURE"] = 16] = "CAPTURE";
      })(MoveFlag || (exports.MoveFlag = MoveFlag = {}));
      var PromotionPiece;
      (function(PromotionPiece2) {
        PromotionPiece2[PromotionPiece2["QUEEN"] = 5] = "QUEEN";
        PromotionPiece2[PromotionPiece2["ROOK"] = 4] = "ROOK";
        PromotionPiece2[PromotionPiece2["BISHOP"] = 3] = "BISHOP";
        PromotionPiece2[PromotionPiece2["KNIGHT"] = 2] = "KNIGHT";
      })(PromotionPiece || (exports.PromotionPiece = PromotionPiece = {}));
      var CastlingType;
      (function(CastlingType2) {
        CastlingType2[CastlingType2["NONE"] = 0] = "NONE";
        CastlingType2[CastlingType2["WHITE_SHORT"] = 1] = "WHITE_SHORT";
        CastlingType2[CastlingType2["WHITE_LONG"] = 2] = "WHITE_LONG";
        CastlingType2[CastlingType2["BLACK_SHORT"] = 3] = "BLACK_SHORT";
        CastlingType2[CastlingType2["BLACK_LONG"] = 4] = "BLACK_LONG";
      })(CastlingType || (exports.CastlingType = CastlingType = {}));
      var MoveOrderType;
      (function(MoveOrderType2) {
        MoveOrderType2[MoveOrderType2["TT_MOVE"] = 1e6] = "TT_MOVE";
        MoveOrderType2[MoveOrderType2["WINNING_CAPTURE"] = 1e5] = "WINNING_CAPTURE";
        MoveOrderType2[MoveOrderType2["KILLER_1"] = 9e4] = "KILLER_1";
        MoveOrderType2[MoveOrderType2["KILLER_2"] = 8e4] = "KILLER_2";
        MoveOrderType2[MoveOrderType2["HISTORY"] = 0] = "HISTORY";
        MoveOrderType2[MoveOrderType2["LOSING_CAPTURE"] = -1e4] = "LOSING_CAPTURE";
      })(MoveOrderType || (exports.MoveOrderType = MoveOrderType = {}));
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/types/ai.types.js
  var require_ai_types = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/types/ai.types.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.TTEntryType = void 0;
      var TTEntryType;
      (function(TTEntryType2) {
        TTEntryType2[TTEntryType2["EXACT"] = 0] = "EXACT";
        TTEntryType2[TTEntryType2["LOWERBOUND"] = 1] = "LOWERBOUND";
        TTEntryType2[TTEntryType2["UPPERBOUND"] = 2] = "UPPERBOUND";
      })(TTEntryType || (exports.TTEntryType = TTEntryType = {}));
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/types/index.js
  var require_types = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/types/index.js"(exports) {
      "use strict";
      var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = { enumerable: true, get: function() {
            return m[k];
          } };
        }
        Object.defineProperty(o, k2, desc);
      }) : (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        o[k2] = m[k];
      }));
      var __exportStar = exports && exports.__exportStar || function(m, exports2) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      __exportStar(require_board_types(), exports);
      __exportStar(require_move_types(), exports);
      __exportStar(require_ai_types(), exports);
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/utils/constants.js
  var require_constants = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/utils/constants.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.CASTLING = exports.ROWS = exports.COLUMNS = exports.TOTAL_SQUARES = exports.BOARD_SIZE = void 0;
      exports.BOARD_SIZE = 8;
      exports.TOTAL_SQUARES = 64;
      exports.COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H"];
      exports.ROWS = ["1", "2", "3", "4", "5", "6", "7", "8"];
      exports.CASTLING = {
        WHITE_SHORT: {
          kingFrom: 4,
          // E1
          kingTo: 6,
          // G1
          rookFrom: 7,
          // H1
          rookTo: 5
          // F1
        },
        WHITE_LONG: {
          kingFrom: 4,
          // E1
          kingTo: 2,
          // C1
          rookFrom: 0,
          // A1
          rookTo: 3
          // D1
        },
        BLACK_SHORT: {
          kingFrom: 60,
          // E8
          kingTo: 62,
          // G8
          rookFrom: 63,
          // H8
          rookTo: 61
          // F8
        },
        BLACK_LONG: {
          kingFrom: 60,
          // E8
          kingTo: 58,
          // C8
          rookFrom: 56,
          // A8
          rookTo: 59
          // D8
        }
      };
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/Board.js
  var require_Board = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/Board.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.createEmptyBoard = createEmptyBoard;
      exports.createStartingBoard = createStartingBoard;
      exports.setPiece = setPiece;
      exports.removePiece = removePiece;
      exports.getPiece = getPiece;
      exports.getBitboard = getBitboard;
      exports.copyBoard = copyBoard;
      exports.isPieceColor = isPieceColor;
      exports.getPieceColor = getPieceColor;
      exports.oppositeColor = oppositeColor;
      exports.isSquareEmpty = isSquareEmpty;
      exports.isSquareEnemy = isSquareEnemy;
      exports.isSquareFriendly = isSquareFriendly;
      var types_1 = require_types();
      var constants_1 = require_constants();
      function createEmptyBoard() {
        return {
          // Mailbox (64 squares, each can hold a piece enum value)
          mailbox: new Int8Array(constants_1.TOTAL_SQUARES),
          // White piece bitboards
          whitePawns: 0n,
          whiteKnights: 0n,
          whiteBishops: 0n,
          whiteRooks: 0n,
          whiteQueens: 0n,
          whiteKing: 0n,
          // Black piece bitboards
          blackPawns: 0n,
          blackKnights: 0n,
          blackBishops: 0n,
          blackRooks: 0n,
          blackQueens: 0n,
          blackKing: 0n,
          // Composite bitboards
          whitePieces: 0n,
          blackPieces: 0n,
          allPieces: 0n,
          // Game state
          turn: types_1.InternalColor.WHITE,
          castlingRights: {
            whiteShort: true,
            blackShort: true,
            whiteLong: true,
            blackLong: true
          },
          enPassantSquare: null,
          halfMoveClock: 0,
          fullMoveNumber: 1,
          // Zobrist hash (will be computed)
          zobristHash: 0n,
          // Game status
          isCheck: false,
          isCheckmate: false,
          isStalemate: false
        };
      }
      function createStartingBoard() {
        const board = createEmptyBoard();
        for (let i = 8; i < 16; i++) {
          setPiece(board, i, types_1.Piece.WHITE_PAWN);
        }
        for (let i = 48; i < 56; i++) {
          setPiece(board, i, types_1.Piece.BLACK_PAWN);
        }
        setPiece(board, 0, types_1.Piece.WHITE_ROOK);
        setPiece(board, 1, types_1.Piece.WHITE_KNIGHT);
        setPiece(board, 2, types_1.Piece.WHITE_BISHOP);
        setPiece(board, 3, types_1.Piece.WHITE_QUEEN);
        setPiece(board, 4, types_1.Piece.WHITE_KING);
        setPiece(board, 5, types_1.Piece.WHITE_BISHOP);
        setPiece(board, 6, types_1.Piece.WHITE_KNIGHT);
        setPiece(board, 7, types_1.Piece.WHITE_ROOK);
        setPiece(board, 56, types_1.Piece.BLACK_ROOK);
        setPiece(board, 57, types_1.Piece.BLACK_KNIGHT);
        setPiece(board, 58, types_1.Piece.BLACK_BISHOP);
        setPiece(board, 59, types_1.Piece.BLACK_QUEEN);
        setPiece(board, 60, types_1.Piece.BLACK_KING);
        setPiece(board, 61, types_1.Piece.BLACK_BISHOP);
        setPiece(board, 62, types_1.Piece.BLACK_KNIGHT);
        setPiece(board, 63, types_1.Piece.BLACK_ROOK);
        board.castlingRights = {
          whiteShort: true,
          whiteLong: true,
          blackShort: true,
          blackLong: true
        };
        return board;
      }
      function setPiece(board, index, piece) {
        const existingPiece = board.mailbox[index];
        if (existingPiece !== types_1.Piece.EMPTY) {
          removePiece(board, index);
        }
        board.mailbox[index] = piece;
        if (piece === types_1.Piece.EMPTY) {
          return;
        }
        const bitboard = 1n << BigInt(index);
        switch (piece) {
          case types_1.Piece.WHITE_PAWN:
            board.whitePawns |= bitboard;
            board.whitePieces |= bitboard;
            break;
          case types_1.Piece.WHITE_KNIGHT:
            board.whiteKnights |= bitboard;
            board.whitePieces |= bitboard;
            break;
          case types_1.Piece.WHITE_BISHOP:
            board.whiteBishops |= bitboard;
            board.whitePieces |= bitboard;
            break;
          case types_1.Piece.WHITE_ROOK:
            board.whiteRooks |= bitboard;
            board.whitePieces |= bitboard;
            break;
          case types_1.Piece.WHITE_QUEEN:
            board.whiteQueens |= bitboard;
            board.whitePieces |= bitboard;
            break;
          case types_1.Piece.WHITE_KING:
            board.whiteKing |= bitboard;
            board.whitePieces |= bitboard;
            break;
          case types_1.Piece.BLACK_PAWN:
            board.blackPawns |= bitboard;
            board.blackPieces |= bitboard;
            break;
          case types_1.Piece.BLACK_KNIGHT:
            board.blackKnights |= bitboard;
            board.blackPieces |= bitboard;
            break;
          case types_1.Piece.BLACK_BISHOP:
            board.blackBishops |= bitboard;
            board.blackPieces |= bitboard;
            break;
          case types_1.Piece.BLACK_ROOK:
            board.blackRooks |= bitboard;
            board.blackPieces |= bitboard;
            break;
          case types_1.Piece.BLACK_QUEEN:
            board.blackQueens |= bitboard;
            board.blackPieces |= bitboard;
            break;
          case types_1.Piece.BLACK_KING:
            board.blackKing |= bitboard;
            board.blackPieces |= bitboard;
            break;
        }
        board.allPieces = board.whitePieces | board.blackPieces;
      }
      function removePiece(board, index) {
        const piece = board.mailbox[index];
        if (piece === types_1.Piece.EMPTY) {
          return;
        }
        board.mailbox[index] = types_1.Piece.EMPTY;
        const bitboard = ~(1n << BigInt(index));
        switch (piece) {
          case types_1.Piece.WHITE_PAWN:
            board.whitePawns &= bitboard;
            board.whitePieces &= bitboard;
            break;
          case types_1.Piece.WHITE_KNIGHT:
            board.whiteKnights &= bitboard;
            board.whitePieces &= bitboard;
            break;
          case types_1.Piece.WHITE_BISHOP:
            board.whiteBishops &= bitboard;
            board.whitePieces &= bitboard;
            break;
          case types_1.Piece.WHITE_ROOK:
            board.whiteRooks &= bitboard;
            board.whitePieces &= bitboard;
            break;
          case types_1.Piece.WHITE_QUEEN:
            board.whiteQueens &= bitboard;
            board.whitePieces &= bitboard;
            break;
          case types_1.Piece.WHITE_KING:
            board.whiteKing &= bitboard;
            board.whitePieces &= bitboard;
            break;
          case types_1.Piece.BLACK_PAWN:
            board.blackPawns &= bitboard;
            board.blackPieces &= bitboard;
            break;
          case types_1.Piece.BLACK_KNIGHT:
            board.blackKnights &= bitboard;
            board.blackPieces &= bitboard;
            break;
          case types_1.Piece.BLACK_BISHOP:
            board.blackBishops &= bitboard;
            board.blackPieces &= bitboard;
            break;
          case types_1.Piece.BLACK_ROOK:
            board.blackRooks &= bitboard;
            board.blackPieces &= bitboard;
            break;
          case types_1.Piece.BLACK_QUEEN:
            board.blackQueens &= bitboard;
            board.blackPieces &= bitboard;
            break;
          case types_1.Piece.BLACK_KING:
            board.blackKing &= bitboard;
            board.blackPieces &= bitboard;
            break;
        }
        board.allPieces = board.whitePieces | board.blackPieces;
      }
      function getPiece(board, index) {
        return board.mailbox[index];
      }
      function getBitboard(board, piece) {
        switch (piece) {
          case types_1.Piece.WHITE_PAWN:
            return board.whitePawns;
          case types_1.Piece.WHITE_KNIGHT:
            return board.whiteKnights;
          case types_1.Piece.WHITE_BISHOP:
            return board.whiteBishops;
          case types_1.Piece.WHITE_ROOK:
            return board.whiteRooks;
          case types_1.Piece.WHITE_QUEEN:
            return board.whiteQueens;
          case types_1.Piece.WHITE_KING:
            return board.whiteKing;
          case types_1.Piece.BLACK_PAWN:
            return board.blackPawns;
          case types_1.Piece.BLACK_KNIGHT:
            return board.blackKnights;
          case types_1.Piece.BLACK_BISHOP:
            return board.blackBishops;
          case types_1.Piece.BLACK_ROOK:
            return board.blackRooks;
          case types_1.Piece.BLACK_QUEEN:
            return board.blackQueens;
          case types_1.Piece.BLACK_KING:
            return board.blackKing;
          default:
            return 0n;
        }
      }
      function copyBoard(source) {
        return {
          // Copy mailbox
          mailbox: new Int8Array(source.mailbox),
          // Copy bitboards (primitives, so direct copy)
          whitePawns: source.whitePawns,
          whiteKnights: source.whiteKnights,
          whiteBishops: source.whiteBishops,
          whiteRooks: source.whiteRooks,
          whiteQueens: source.whiteQueens,
          whiteKing: source.whiteKing,
          blackPawns: source.blackPawns,
          blackKnights: source.blackKnights,
          blackBishops: source.blackBishops,
          blackRooks: source.blackRooks,
          blackQueens: source.blackQueens,
          blackKing: source.blackKing,
          whitePieces: source.whitePieces,
          blackPieces: source.blackPieces,
          allPieces: source.allPieces,
          // Copy game state
          turn: source.turn,
          castlingRights: { ...source.castlingRights },
          enPassantSquare: source.enPassantSquare,
          halfMoveClock: source.halfMoveClock,
          fullMoveNumber: source.fullMoveNumber,
          zobristHash: source.zobristHash,
          isCheck: source.isCheck,
          isCheckmate: source.isCheckmate,
          isStalemate: source.isStalemate
        };
      }
      function isPieceColor(piece, color) {
        if (piece === types_1.Piece.EMPTY) {
          return false;
        }
        if (color === types_1.InternalColor.WHITE) {
          return piece >= types_1.Piece.WHITE_PAWN && piece <= types_1.Piece.WHITE_KING;
        } else {
          return piece >= types_1.Piece.BLACK_PAWN && piece <= types_1.Piece.BLACK_KING;
        }
      }
      function getPieceColor(piece) {
        if (piece === types_1.Piece.EMPTY) {
          return null;
        }
        return piece >= types_1.Piece.WHITE_PAWN && piece <= types_1.Piece.WHITE_KING ? types_1.InternalColor.WHITE : types_1.InternalColor.BLACK;
      }
      function oppositeColor(color) {
        return color === types_1.InternalColor.WHITE ? types_1.InternalColor.BLACK : types_1.InternalColor.WHITE;
      }
      function isSquareEmpty(board, index) {
        return board.mailbox[index] === types_1.Piece.EMPTY;
      }
      function isSquareEnemy(board, index, color) {
        const piece = board.mailbox[index];
        if (piece === types_1.Piece.EMPTY) {
          return false;
        }
        const pieceColor = getPieceColor(piece);
        return pieceColor !== null && pieceColor !== color;
      }
      function isSquareFriendly(board, index, color) {
        const piece = board.mailbox[index];
        if (piece === types_1.Piece.EMPTY) {
          return false;
        }
        return isPieceColor(piece, color);
      }
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/utils/conversion.js
  var require_conversion = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/utils/conversion.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.squareToIndex = squareToIndex;
      exports.indexToSquare = indexToSquare;
      exports.getFileIndex = getFileIndex;
      exports.getRankIndex = getRankIndex;
      exports.getFile = getFile;
      exports.getRank = getRank;
      exports.fileRankToIndex = fileRankToIndex;
      exports.isValidSquare = isValidSquare;
      exports.isValidIndex = isValidIndex;
      exports.indexToBitboard = indexToBitboard;
      exports.squareToBitboard = squareToBitboard;
      exports.bitboardToIndices = bitboardToIndices;
      exports.getLowestSetBit = getLowestSetBit;
      exports.getHighestSetBit = getHighestSetBit;
      exports.popCount = popCount;
      exports.manhattanDistance = manhattanDistance;
      exports.chebyshevDistance = chebyshevDistance;
      exports.isOnEdge = isOnEdge;
      exports.isAFile = isAFile;
      exports.isHFile = isHFile;
      exports.isRank1 = isRank1;
      exports.isRank8 = isRank8;
      var constants_1 = require_constants();
      function squareToIndex(square) {
        const normalized = square.toUpperCase();
        if (normalized.length !== 2) {
          throw new Error(`Invalid square notation: ${square}`);
        }
        const file = normalized[0];
        const rank = normalized[1];
        const fileIndex = constants_1.COLUMNS.indexOf(file);
        const rankIndex = constants_1.ROWS.indexOf(rank);
        if (fileIndex === -1 || rankIndex === -1) {
          throw new Error(`Invalid square notation: ${square}`);
        }
        return rankIndex * 8 + fileIndex;
      }
      function indexToSquare(index) {
        if (index < 0 || index > 63) {
          throw new Error(`Invalid square index: ${index}`);
        }
        const fileIndex = index % 8;
        const rankIndex = Math.floor(index / 8);
        return `${constants_1.COLUMNS[fileIndex]}${constants_1.ROWS[rankIndex]}`;
      }
      function getFileIndex(index) {
        return index % 8;
      }
      function getRankIndex(index) {
        return Math.floor(index / 8);
      }
      function getFile(square) {
        const normalized = square.toUpperCase();
        const fileIndex = constants_1.COLUMNS.indexOf(normalized[0]);
        if (fileIndex === -1) {
          throw new Error(`Invalid square notation: ${square}`);
        }
        return fileIndex;
      }
      function getRank(square) {
        const normalized = square.toUpperCase();
        const rankIndex = constants_1.ROWS.indexOf(normalized[1]);
        if (rankIndex === -1) {
          throw new Error(`Invalid square notation: ${square}`);
        }
        return rankIndex;
      }
      function fileRankToIndex(file, rank) {
        return rank * 8 + file;
      }
      function isValidSquare(square) {
        if (typeof square !== "string" || square.length !== 2) {
          return false;
        }
        const normalized = square.toUpperCase();
        const file = normalized[0];
        const rank = normalized[1];
        return constants_1.COLUMNS.includes(file) && constants_1.ROWS.includes(rank);
      }
      function isValidIndex(index) {
        return Number.isInteger(index) && index >= 0 && index <= 63;
      }
      function indexToBitboard(index) {
        return 1n << BigInt(index);
      }
      function squareToBitboard(square) {
        return indexToBitboard(squareToIndex(square));
      }
      function bitboardToIndices(bitboard) {
        const indices = [];
        let bb = bitboard;
        while (bb !== 0n) {
          const index = getLowestSetBit(bb);
          indices.push(index);
          bb &= bb - 1n;
        }
        return indices;
      }
      var DE_BRUIJN_64 = 0x03f79d71b4cb0a89n;
      var MASK_64 = 0xffffffffffffffffn;
      var DE_BRUIJN_TABLE = new Int8Array(64);
      for (let i = 0; i < 64; i++) {
        DE_BRUIJN_TABLE[Number(((1n << BigInt(i)) * DE_BRUIJN_64 & MASK_64) >> 58n)] = i;
      }
      function getLowestSetBit(bitboard) {
        if (bitboard === 0n)
          return -1;
        const isolated = bitboard & -bitboard;
        return DE_BRUIJN_TABLE[Number((isolated * DE_BRUIJN_64 & MASK_64) >> 58n)];
      }
      function getHighestSetBit(bitboard) {
        if (bitboard === 0n)
          return -1;
        let bb = bitboard;
        bb |= bb >> 1n;
        bb |= bb >> 2n;
        bb |= bb >> 4n;
        bb |= bb >> 8n;
        bb |= bb >> 16n;
        bb |= bb >> 32n;
        const msb = bb - (bb >> 1n);
        return DE_BRUIJN_TABLE[Number((msb * DE_BRUIJN_64 & MASK_64) >> 58n)];
      }
      function popCount(bitboard) {
        let count = 0;
        let bb = bitboard;
        while (bb !== 0n) {
          bb &= bb - 1n;
          count++;
        }
        return count;
      }
      function manhattanDistance(from, to) {
        const fromFile = getFileIndex(from);
        const fromRank = getRankIndex(from);
        const toFile = getFileIndex(to);
        const toRank = getRankIndex(to);
        return Math.abs(fromFile - toFile) + Math.abs(fromRank - toRank);
      }
      function chebyshevDistance(from, to) {
        const fromFile = getFileIndex(from);
        const fromRank = getRankIndex(from);
        const toFile = getFileIndex(to);
        const toRank = getRankIndex(to);
        return Math.max(Math.abs(fromFile - toFile), Math.abs(fromRank - toRank));
      }
      function isOnEdge(index) {
        const file = getFileIndex(index);
        const rank = getRankIndex(index);
        return file === 0 || file === 7 || rank === 0 || rank === 7;
      }
      function isAFile(index) {
        return getFileIndex(index) === 0;
      }
      function isHFile(index) {
        return getFileIndex(index) === 7;
      }
      function isRank1(index) {
        return getRankIndex(index) === 0;
      }
      function isRank8(index) {
        return getRankIndex(index) === 7;
      }
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/Position.js
  var require_Position = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/Position.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.KNIGHT_ATTACKS = exports.KING_ATTACKS = exports.NOT_RANK_8 = exports.NOT_RANK_1 = exports.NOT_GH_FILE = exports.NOT_AB_FILE = exports.NOT_H_FILE = exports.NOT_A_FILE = exports.EDGE_MASK = exports.ANTI_DIAGONAL_MASKS = exports.DIAGONAL_MASKS = exports.RANK_MASKS = exports.FILE_MASKS = void 0;
      exports.shiftNorth = shiftNorth;
      exports.shiftSouth = shiftSouth;
      exports.shiftEast = shiftEast;
      exports.shiftWest = shiftWest;
      exports.shiftNorthEast = shiftNorthEast;
      exports.shiftNorthWest = shiftNorthWest;
      exports.shiftSouthEast = shiftSouthEast;
      exports.shiftSouthWest = shiftSouthWest;
      exports.getFileMask = getFileMask;
      exports.getRankMask = getRankMask;
      exports.getDiagonalMask = getDiagonalMask;
      exports.getAntiDiagonalMask = getAntiDiagonalMask;
      exports.getRookAttacks = getRookAttacks;
      exports.getBishopAttacks = getBishopAttacks;
      exports.getQueenAttacks = getQueenAttacks;
      exports.initializeAttackTables = initializeAttackTables;
      exports.getKingAttacks = getKingAttacks;
      exports.getKnightAttacks = getKnightAttacks;
      exports.getWhitePawnAttacks = getWhitePawnAttacks;
      exports.getBlackPawnAttacks = getBlackPawnAttacks;
      exports.getWhitePawnsAttacks = getWhitePawnsAttacks;
      exports.getBlackPawnsAttacks = getBlackPawnsAttacks;
      var conversion_1 = require_conversion();
      exports.FILE_MASKS = [
        0x0101010101010101n,
        // A-file
        0x0202020202020202n,
        // B-file
        0x0404040404040404n,
        // C-file
        0x0808080808080808n,
        // D-file
        0x1010101010101010n,
        // E-file
        0x2020202020202020n,
        // F-file
        0x4040404040404040n,
        // G-file
        0x8080808080808080n
        // H-file
      ];
      exports.RANK_MASKS = [
        0x00000000000000ffn,
        // Rank 1
        0x000000000000ff00n,
        // Rank 2
        0x0000000000ff0000n,
        // Rank 3
        0x00000000ff000000n,
        // Rank 4
        0x000000ff00000000n,
        // Rank 5
        0x0000ff0000000000n,
        // Rank 6
        0x00ff000000000000n,
        // Rank 7
        0xff00000000000000n
        // Rank 8
      ];
      exports.DIAGONAL_MASKS = [
        0x0000000000000001n,
        0x0000000000000102n,
        0x0000000000010204n,
        0x0000000001020408n,
        0x0000000102040810n,
        0x0000010204081020n,
        0x0001020408102040n,
        0x0102040810204080n,
        0x0204081020408000n,
        0x0408102040800000n,
        0x0810204080000000n,
        0x1020408000000000n,
        0x2040800000000000n,
        0x4080000000000000n,
        0x8000000000000000n
      ];
      exports.ANTI_DIAGONAL_MASKS = [
        0x0000000000000080n,
        0x0000000000008040n,
        0x0000000000804020n,
        0x0000000080402010n,
        0x0000008040201008n,
        0x0000804020100804n,
        0x0080402010080402n,
        0x8040201008040201n,
        0x4020100804020100n,
        0x2010080402010000n,
        0x1008040201000000n,
        0x0804020100000000n,
        0x0402010000000000n,
        0x0201000000000000n,
        0x0100000000000000n
      ];
      exports.EDGE_MASK = 0xff818181818181ffn;
      exports.NOT_A_FILE = 0xfefefefefefefefen;
      exports.NOT_H_FILE = 0x7f7f7f7f7f7f7f7fn;
      exports.NOT_AB_FILE = 0xfcfcfcfcfcfcfcfcn;
      exports.NOT_GH_FILE = 0x3f3f3f3f3f3f3f3fn;
      exports.NOT_RANK_1 = 0xffffffffffffff00n;
      exports.NOT_RANK_8 = 0x00ffffffffffffffn;
      function shiftNorth(bb) {
        return (bb & exports.NOT_RANK_8) << 8n;
      }
      function shiftSouth(bb) {
        return (bb & exports.NOT_RANK_1) >> 8n;
      }
      function shiftEast(bb) {
        return (bb & exports.NOT_H_FILE) << 1n;
      }
      function shiftWest(bb) {
        return (bb & exports.NOT_A_FILE) >> 1n;
      }
      function shiftNorthEast(bb) {
        return (bb & exports.NOT_H_FILE & exports.NOT_RANK_8) << 9n;
      }
      function shiftNorthWest(bb) {
        return (bb & exports.NOT_A_FILE & exports.NOT_RANK_8) << 7n;
      }
      function shiftSouthEast(bb) {
        return (bb & exports.NOT_H_FILE & exports.NOT_RANK_1) >> 7n;
      }
      function shiftSouthWest(bb) {
        return (bb & exports.NOT_A_FILE & exports.NOT_RANK_1) >> 9n;
      }
      function getFileMask(index) {
        const file = (0, conversion_1.getFileIndex)(index);
        return exports.FILE_MASKS[file];
      }
      function getRankMask(index) {
        const rank = (0, conversion_1.getRankIndex)(index);
        return exports.RANK_MASKS[rank];
      }
      function getDiagonalMask(index) {
        const file = (0, conversion_1.getFileIndex)(index);
        const rank = (0, conversion_1.getRankIndex)(index);
        const diagonalIndex = 7 + rank - file;
        return exports.DIAGONAL_MASKS[diagonalIndex];
      }
      function getAntiDiagonalMask(index) {
        const file = (0, conversion_1.getFileIndex)(index);
        const rank = (0, conversion_1.getRankIndex)(index);
        const antiDiagonalIndex = rank + file;
        return exports.ANTI_DIAGONAL_MASKS[antiDiagonalIndex];
      }
      var RAY_TABLE = Array.from({ length: 8 }, () => new Array(64));
      function initRayTables() {
        const directions = [8, -8, 1, -1, 9, 7, -7, -9];
        for (let dirIdx = 0; dirIdx < 8; dirIdx++) {
          const dir = directions[dirIdx];
          for (let sq = 0; sq < 64; sq++) {
            let attacks = 0n;
            let current = sq;
            while (true) {
              const next = current + dir;
              if (next < 0 || next > 63)
                break;
              const cf = current % 8;
              const nf = next % 8;
              const fd = Math.abs(nf - cf);
              if (dir === 1 || dir === -1) {
                if (fd !== 1)
                  break;
              } else if (dir === 8 || dir === -8) {
                if (fd !== 0)
                  break;
              } else {
                if (fd !== 1)
                  break;
              }
              attacks |= 1n << BigInt(next);
              current = next;
            }
            RAY_TABLE[dirIdx][sq] = attacks;
          }
        }
      }
      initRayTables();
      function positiveRay(dirIdx, square, occupied) {
        const ray = RAY_TABLE[dirIdx][square];
        const blockers = ray & occupied;
        if (blockers === 0n)
          return ray;
        const first = (0, conversion_1.getLowestSetBit)(blockers);
        return ray ^ RAY_TABLE[dirIdx][first];
      }
      function negativeRay(dirIdx, square, occupied) {
        const ray = RAY_TABLE[dirIdx][square];
        const blockers = ray & occupied;
        if (blockers === 0n)
          return ray;
        const first = (0, conversion_1.getHighestSetBit)(blockers);
        return ray ^ RAY_TABLE[dirIdx][first];
      }
      function getRookAttacks(square, occupied) {
        return positiveRay(0, square, occupied) | // North
        negativeRay(1, square, occupied) | // South
        positiveRay(2, square, occupied) | // East
        negativeRay(3, square, occupied);
      }
      function getBishopAttacks(square, occupied) {
        return positiveRay(4, square, occupied) | // NE
        positiveRay(5, square, occupied) | // NW
        negativeRay(6, square, occupied) | // SE
        negativeRay(7, square, occupied);
      }
      function getQueenAttacks(square, occupied) {
        return getRookAttacks(square, occupied) | getBishopAttacks(square, occupied);
      }
      exports.KING_ATTACKS = new Array(64);
      exports.KNIGHT_ATTACKS = new Array(64);
      function initializeAttackTables() {
        for (let sq = 0; sq < 64; sq++) {
          let attacks = 0n;
          const sqBit = 1n << BigInt(sq);
          attacks |= shiftNorth(sqBit);
          attacks |= shiftSouth(sqBit);
          attacks |= shiftEast(sqBit);
          attacks |= shiftWest(sqBit);
          attacks |= shiftNorthEast(sqBit);
          attacks |= shiftNorthWest(sqBit);
          attacks |= shiftSouthEast(sqBit);
          attacks |= shiftSouthWest(sqBit);
          exports.KING_ATTACKS[sq] = attacks;
        }
        for (let sq = 0; sq < 64; sq++) {
          let attacks = 0n;
          const sqBit = 1n << BigInt(sq);
          const nnw = shiftNorth(shiftNorth(shiftWest(sqBit)));
          const nne = shiftNorth(shiftNorth(shiftEast(sqBit)));
          const nee = shiftEast(shiftEast(shiftNorth(sqBit)));
          const see = shiftEast(shiftEast(shiftSouth(sqBit)));
          const sse = shiftSouth(shiftSouth(shiftEast(sqBit)));
          const ssw = shiftSouth(shiftSouth(shiftWest(sqBit)));
          const sww = shiftWest(shiftWest(shiftSouth(sqBit)));
          const nww = shiftWest(shiftWest(shiftNorth(sqBit)));
          attacks = nnw | nne | nee | see | sse | ssw | sww | nww;
          exports.KNIGHT_ATTACKS[sq] = attacks;
        }
      }
      initializeAttackTables();
      function getKingAttacks(square) {
        const attacks = exports.KING_ATTACKS[square];
        return attacks !== void 0 ? attacks : 0n;
      }
      function getKnightAttacks(square) {
        const attacks = exports.KNIGHT_ATTACKS[square];
        return attacks !== void 0 ? attacks : 0n;
      }
      function getWhitePawnAttacks(square) {
        const sqBit = 1n << BigInt(square);
        return shiftNorthEast(sqBit) | shiftNorthWest(sqBit);
      }
      function getBlackPawnAttacks(square) {
        const sqBit = 1n << BigInt(square);
        return shiftSouthEast(sqBit) | shiftSouthWest(sqBit);
      }
      function getWhitePawnsAttacks(pawns) {
        return shiftNorthEast(pawns) | shiftNorthWest(pawns);
      }
      function getBlackPawnsAttacks(pawns) {
        return shiftSouthEast(pawns) | shiftSouthWest(pawns);
      }
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/AttackDetector.js
  var require_AttackDetector = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/AttackDetector.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.isSquareAttacked = isSquareAttacked;
      exports.isKingInCheck = isKingInCheck;
      exports.getAttackedSquares = getAttackedSquares;
      exports.getAttackers = getAttackers;
      exports.wouldLeaveKingInCheck = wouldLeaveKingInCheck;
      var types_1 = require_types();
      var Position_1 = require_Position();
      var conversion_1 = require_conversion();
      function isSquareAttacked(board, square, attackerColor) {
        const attackers = attackerColor === types_1.InternalColor.WHITE ? board.whitePieces : board.blackPieces;
        const pawnAttackOrigins = attackerColor === types_1.InternalColor.WHITE ? (0, Position_1.getBlackPawnAttacks)(square) : (0, Position_1.getWhitePawnAttacks)(square);
        const pawns = attackerColor === types_1.InternalColor.WHITE ? board.whitePawns : board.blackPawns;
        if ((pawnAttackOrigins & pawns) !== 0n) {
          return true;
        }
        const knightAttacks = (0, Position_1.getKnightAttacks)(square);
        const knights = attackerColor === types_1.InternalColor.WHITE ? board.whiteKnights : board.blackKnights;
        if ((knightAttacks & knights) !== 0n) {
          return true;
        }
        const bishopAttacks = (0, Position_1.getBishopAttacks)(square, board.allPieces);
        const bishops = attackerColor === types_1.InternalColor.WHITE ? board.whiteBishops : board.blackBishops;
        const queens = attackerColor === types_1.InternalColor.WHITE ? board.whiteQueens : board.blackQueens;
        if ((bishopAttacks & (bishops | queens)) !== 0n) {
          return true;
        }
        const rookAttacks = (0, Position_1.getRookAttacks)(square, board.allPieces);
        const rooks = attackerColor === types_1.InternalColor.WHITE ? board.whiteRooks : board.blackRooks;
        if ((rookAttacks & (rooks | queens)) !== 0n) {
          return true;
        }
        const kingAttacks = (0, Position_1.getKingAttacks)(square);
        const king = attackerColor === types_1.InternalColor.WHITE ? board.whiteKing : board.blackKing;
        if ((kingAttacks & king) !== 0n) {
          return true;
        }
        return false;
      }
      function isKingInCheck(board) {
        const kingBitboard = board.turn === types_1.InternalColor.WHITE ? board.whiteKing : board.blackKing;
        if (kingBitboard === 0n) {
          return false;
        }
        const kingSquare = (0, conversion_1.getLowestSetBit)(kingBitboard);
        const opponentColor = board.turn === types_1.InternalColor.WHITE ? types_1.InternalColor.BLACK : types_1.InternalColor.WHITE;
        return isSquareAttacked(board, kingSquare, opponentColor);
      }
      function getAttackedSquares(board, attackerColor) {
        let attacked = 0n;
        const pawns = attackerColor === types_1.InternalColor.WHITE ? board.whitePawns : board.blackPawns;
        if (attackerColor === types_1.InternalColor.WHITE) {
          attacked |= (pawns & 0xfefefefefefefefen) << 9n;
          attacked |= (pawns & 0x7f7f7f7f7f7f7f7fn) << 7n;
        } else {
          attacked |= (pawns & 0xfefefefefefefefen) >> 7n;
          attacked |= (pawns & 0x7f7f7f7f7f7f7f7fn) >> 9n;
        }
        const knights = attackerColor === types_1.InternalColor.WHITE ? board.whiteKnights : board.blackKnights;
        let knightsBB = knights;
        while (knightsBB !== 0n) {
          const sq = (0, conversion_1.getLowestSetBit)(knightsBB);
          attacked |= (0, Position_1.getKnightAttacks)(sq);
          knightsBB &= knightsBB - 1n;
        }
        const bishops = attackerColor === types_1.InternalColor.WHITE ? board.whiteBishops : board.blackBishops;
        let bishopsBB = bishops;
        while (bishopsBB !== 0n) {
          const sq = (0, conversion_1.getLowestSetBit)(bishopsBB);
          attacked |= (0, Position_1.getBishopAttacks)(sq, board.allPieces);
          bishopsBB &= bishopsBB - 1n;
        }
        const rooks = attackerColor === types_1.InternalColor.WHITE ? board.whiteRooks : board.blackRooks;
        let rooksBB = rooks;
        while (rooksBB !== 0n) {
          const sq = (0, conversion_1.getLowestSetBit)(rooksBB);
          attacked |= (0, Position_1.getRookAttacks)(sq, board.allPieces);
          rooksBB &= rooksBB - 1n;
        }
        const queens = attackerColor === types_1.InternalColor.WHITE ? board.whiteQueens : board.blackQueens;
        let queensBB = queens;
        while (queensBB !== 0n) {
          const sq = (0, conversion_1.getLowestSetBit)(queensBB);
          attacked |= (0, Position_1.getQueenAttacks)(sq, board.allPieces);
          queensBB &= queensBB - 1n;
        }
        const king = attackerColor === types_1.InternalColor.WHITE ? board.whiteKing : board.blackKing;
        if (king !== 0n) {
          const kingSquare = (0, conversion_1.getLowestSetBit)(king);
          attacked |= (0, Position_1.getKingAttacks)(kingSquare);
        }
        return attacked;
      }
      function getAttackers(board, square, attackerColor) {
        let attackers = 0n;
        const pawnAttackOrigins = attackerColor === types_1.InternalColor.WHITE ? (0, Position_1.getBlackPawnAttacks)(square) : (0, Position_1.getWhitePawnAttacks)(square);
        const pawns = attackerColor === types_1.InternalColor.WHITE ? board.whitePawns : board.blackPawns;
        attackers |= pawnAttackOrigins & pawns;
        const knightAttacks = (0, Position_1.getKnightAttacks)(square);
        const knights = attackerColor === types_1.InternalColor.WHITE ? board.whiteKnights : board.blackKnights;
        attackers |= knightAttacks & knights;
        const bishopAttacks = (0, Position_1.getBishopAttacks)(square, board.allPieces);
        const bishops = attackerColor === types_1.InternalColor.WHITE ? board.whiteBishops : board.blackBishops;
        const queens = attackerColor === types_1.InternalColor.WHITE ? board.whiteQueens : board.blackQueens;
        attackers |= bishopAttacks & (bishops | queens);
        const rookAttacks = (0, Position_1.getRookAttacks)(square, board.allPieces);
        const rooks = attackerColor === types_1.InternalColor.WHITE ? board.whiteRooks : board.blackRooks;
        attackers |= rookAttacks & (rooks | queens);
        const kingAttacks = (0, Position_1.getKingAttacks)(square);
        const king = attackerColor === types_1.InternalColor.WHITE ? board.whiteKing : board.blackKing;
        attackers |= kingAttacks & king;
        return attackers;
      }
      function wouldLeaveKingInCheck(board, from, to) {
        const piece = board.mailbox[from];
        const capturedPiece = board.mailbox[to];
        const color = board.turn;
        board.mailbox[from] = types_1.Piece.EMPTY;
        board.mailbox[to] = piece;
        const fromBit = 1n << BigInt(from);
        const toBit = 1n << BigInt(to);
        const moveBits = fromBit | toBit;
        let originalPieceBB;
        let originalCapturedBB = null;
        switch (piece) {
          case types_1.Piece.WHITE_PAWN:
            originalPieceBB = board.whitePawns;
            board.whitePawns = board.whitePawns & ~fromBit | toBit;
            break;
          case types_1.Piece.WHITE_KNIGHT:
            originalPieceBB = board.whiteKnights;
            board.whiteKnights = board.whiteKnights & ~fromBit | toBit;
            break;
          case types_1.Piece.WHITE_BISHOP:
            originalPieceBB = board.whiteBishops;
            board.whiteBishops = board.whiteBishops & ~fromBit | toBit;
            break;
          case types_1.Piece.WHITE_ROOK:
            originalPieceBB = board.whiteRooks;
            board.whiteRooks = board.whiteRooks & ~fromBit | toBit;
            break;
          case types_1.Piece.WHITE_QUEEN:
            originalPieceBB = board.whiteQueens;
            board.whiteQueens = board.whiteQueens & ~fromBit | toBit;
            break;
          case types_1.Piece.WHITE_KING:
            originalPieceBB = board.whiteKing;
            board.whiteKing = board.whiteKing & ~fromBit | toBit;
            break;
          case types_1.Piece.BLACK_PAWN:
            originalPieceBB = board.blackPawns;
            board.blackPawns = board.blackPawns & ~fromBit | toBit;
            break;
          case types_1.Piece.BLACK_KNIGHT:
            originalPieceBB = board.blackKnights;
            board.blackKnights = board.blackKnights & ~fromBit | toBit;
            break;
          case types_1.Piece.BLACK_BISHOP:
            originalPieceBB = board.blackBishops;
            board.blackBishops = board.blackBishops & ~fromBit | toBit;
            break;
          case types_1.Piece.BLACK_ROOK:
            originalPieceBB = board.blackRooks;
            board.blackRooks = board.blackRooks & ~fromBit | toBit;
            break;
          case types_1.Piece.BLACK_QUEEN:
            originalPieceBB = board.blackQueens;
            board.blackQueens = board.blackQueens & ~fromBit | toBit;
            break;
          case types_1.Piece.BLACK_KING:
            originalPieceBB = board.blackKing;
            board.blackKing = board.blackKing & ~fromBit | toBit;
            break;
          default:
            originalPieceBB = 0n;
        }
        if (capturedPiece !== types_1.Piece.EMPTY) {
          switch (capturedPiece) {
            case types_1.Piece.WHITE_PAWN:
              originalCapturedBB = board.whitePawns;
              board.whitePawns &= ~toBit;
              break;
            case types_1.Piece.WHITE_KNIGHT:
              originalCapturedBB = board.whiteKnights;
              board.whiteKnights &= ~toBit;
              break;
            case types_1.Piece.WHITE_BISHOP:
              originalCapturedBB = board.whiteBishops;
              board.whiteBishops &= ~toBit;
              break;
            case types_1.Piece.WHITE_ROOK:
              originalCapturedBB = board.whiteRooks;
              board.whiteRooks &= ~toBit;
              break;
            case types_1.Piece.WHITE_QUEEN:
              originalCapturedBB = board.whiteQueens;
              board.whiteQueens &= ~toBit;
              break;
            case types_1.Piece.BLACK_PAWN:
              originalCapturedBB = board.blackPawns;
              board.blackPawns &= ~toBit;
              break;
            case types_1.Piece.BLACK_KNIGHT:
              originalCapturedBB = board.blackKnights;
              board.blackKnights &= ~toBit;
              break;
            case types_1.Piece.BLACK_BISHOP:
              originalCapturedBB = board.blackBishops;
              board.blackBishops &= ~toBit;
              break;
            case types_1.Piece.BLACK_ROOK:
              originalCapturedBB = board.blackRooks;
              board.blackRooks &= ~toBit;
              break;
            case types_1.Piece.BLACK_QUEEN:
              originalCapturedBB = board.blackQueens;
              board.blackQueens &= ~toBit;
              break;
          }
        }
        const originalWhitePieces = board.whitePieces;
        const originalBlackPieces = board.blackPieces;
        const originalAllPieces = board.allPieces;
        board.whitePieces = board.whitePawns | board.whiteKnights | board.whiteBishops | board.whiteRooks | board.whiteQueens | board.whiteKing;
        board.blackPieces = board.blackPawns | board.blackKnights | board.blackBishops | board.blackRooks | board.blackQueens | board.blackKing;
        board.allPieces = board.whitePieces | board.blackPieces;
        const inCheck = isKingInCheck(board);
        board.mailbox[from] = piece;
        board.mailbox[to] = capturedPiece;
        switch (piece) {
          case types_1.Piece.WHITE_PAWN:
            board.whitePawns = originalPieceBB;
            break;
          case types_1.Piece.WHITE_KNIGHT:
            board.whiteKnights = originalPieceBB;
            break;
          case types_1.Piece.WHITE_BISHOP:
            board.whiteBishops = originalPieceBB;
            break;
          case types_1.Piece.WHITE_ROOK:
            board.whiteRooks = originalPieceBB;
            break;
          case types_1.Piece.WHITE_QUEEN:
            board.whiteQueens = originalPieceBB;
            break;
          case types_1.Piece.WHITE_KING:
            board.whiteKing = originalPieceBB;
            break;
          case types_1.Piece.BLACK_PAWN:
            board.blackPawns = originalPieceBB;
            break;
          case types_1.Piece.BLACK_KNIGHT:
            board.blackKnights = originalPieceBB;
            break;
          case types_1.Piece.BLACK_BISHOP:
            board.blackBishops = originalPieceBB;
            break;
          case types_1.Piece.BLACK_ROOK:
            board.blackRooks = originalPieceBB;
            break;
          case types_1.Piece.BLACK_QUEEN:
            board.blackQueens = originalPieceBB;
            break;
          case types_1.Piece.BLACK_KING:
            board.blackKing = originalPieceBB;
            break;
        }
        if (originalCapturedBB !== null) {
          switch (capturedPiece) {
            case types_1.Piece.WHITE_PAWN:
              board.whitePawns = originalCapturedBB;
              break;
            case types_1.Piece.WHITE_KNIGHT:
              board.whiteKnights = originalCapturedBB;
              break;
            case types_1.Piece.WHITE_BISHOP:
              board.whiteBishops = originalCapturedBB;
              break;
            case types_1.Piece.WHITE_ROOK:
              board.whiteRooks = originalCapturedBB;
              break;
            case types_1.Piece.WHITE_QUEEN:
              board.whiteQueens = originalCapturedBB;
              break;
            case types_1.Piece.BLACK_PAWN:
              board.blackPawns = originalCapturedBB;
              break;
            case types_1.Piece.BLACK_KNIGHT:
              board.blackKnights = originalCapturedBB;
              break;
            case types_1.Piece.BLACK_BISHOP:
              board.blackBishops = originalCapturedBB;
              break;
            case types_1.Piece.BLACK_ROOK:
              board.blackRooks = originalCapturedBB;
              break;
            case types_1.Piece.BLACK_QUEEN:
              board.blackQueens = originalCapturedBB;
              break;
          }
        }
        board.whitePieces = originalWhitePieces;
        board.blackPieces = originalBlackPieces;
        board.allPieces = originalAllPieces;
        return inCheck;
      }
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/zobrist.js
  var require_zobrist = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/zobrist.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.initZobrist = initZobrist;
      exports.computeZobristHash = computeZobristHash;
      exports.updateHashMove = updateHashMove;
      exports.updateHashCapture = updateHashCapture;
      exports.toggleSide = toggleSide;
      exports.updateHashCastling = updateHashCastling;
      exports.updateHashEnPassant = updateHashEnPassant;
      exports.addPieceToHash = addPieceToHash;
      exports.removePieceFromHash = removePieceFromHash;
      var types_1 = require_types();
      var constants_1 = require_constants();
      var pieceKeys = [];
      var sideKey = 0n;
      var castlingKeys = [];
      var enPassantKeys = [];
      function initZobrist() {
        let seed = 12345n;
        const rand64 = () => {
          seed ^= seed << 13n;
          seed ^= seed >> 7n;
          seed ^= seed << 17n;
          return seed;
        };
        pieceKeys = [];
        for (let piece = 0; piece <= 12; piece++) {
          pieceKeys[piece] = [];
          for (let square = 0; square < constants_1.TOTAL_SQUARES; square++) {
            pieceKeys[piece][square] = rand64();
          }
        }
        sideKey = rand64();
        castlingKeys = [
          rand64(),
          // white short
          rand64(),
          // white long
          rand64(),
          // black short
          rand64()
          // black long
        ];
        enPassantKeys = [];
        for (let file = 0; file < 8; file++) {
          enPassantKeys[file] = rand64();
        }
      }
      function computeZobristHash(board) {
        let hash = 0n;
        for (let square = 0; square < constants_1.TOTAL_SQUARES; square++) {
          const piece = board.mailbox[square];
          if (piece !== types_1.Piece.EMPTY) {
            hash ^= pieceKeys[piece][square];
          }
        }
        if (board.turn === types_1.InternalColor.WHITE) {
          hash ^= sideKey;
        }
        if (board.castlingRights.whiteShort) {
          hash ^= castlingKeys[0];
        }
        if (board.castlingRights.whiteLong) {
          hash ^= castlingKeys[1];
        }
        if (board.castlingRights.blackShort) {
          hash ^= castlingKeys[2];
        }
        if (board.castlingRights.blackLong) {
          hash ^= castlingKeys[3];
        }
        if (board.enPassantSquare !== null) {
          const file = board.enPassantSquare % 8;
          hash ^= enPassantKeys[file];
        }
        return hash;
      }
      function updateHashMove(hash, piece, from, to) {
        hash ^= pieceKeys[piece][from];
        hash ^= pieceKeys[piece][to];
        return hash;
      }
      function updateHashCapture(hash, capturedPiece, square) {
        hash ^= pieceKeys[capturedPiece][square];
        return hash;
      }
      function toggleSide(hash) {
        return hash ^ sideKey;
      }
      function updateHashCastling(hash, whiteShortOld, whiteShortNew, whiteLongOld, whiteLongNew, blackShortOld, blackShortNew, blackLongOld, blackLongNew) {
        if (whiteShortOld)
          hash ^= castlingKeys[0];
        if (whiteLongOld)
          hash ^= castlingKeys[1];
        if (blackShortOld)
          hash ^= castlingKeys[2];
        if (blackLongOld)
          hash ^= castlingKeys[3];
        if (whiteShortNew)
          hash ^= castlingKeys[0];
        if (whiteLongNew)
          hash ^= castlingKeys[1];
        if (blackShortNew)
          hash ^= castlingKeys[2];
        if (blackLongNew)
          hash ^= castlingKeys[3];
        return hash;
      }
      function updateHashEnPassant(hash, oldSquare, newSquare) {
        if (oldSquare !== null) {
          const oldFile = oldSquare % 8;
          hash ^= enPassantKeys[oldFile];
        }
        if (newSquare !== null) {
          const newFile = newSquare % 8;
          hash ^= enPassantKeys[newFile];
        }
        return hash;
      }
      function addPieceToHash(hash, piece, square) {
        return hash ^ pieceKeys[piece][square];
      }
      function removePieceFromHash(hash, piece, square) {
        return hash ^ pieceKeys[piece][square];
      }
      initZobrist();
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/MoveGenerator.js
  var require_MoveGenerator = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/core/MoveGenerator.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.generateLegalMoves = generateLegalMoves;
      exports.generatePseudoLegalMoves = generatePseudoLegalMoves;
      exports.getMovesForPiece = getMovesForPiece;
      exports.isMoveLegal = isMoveLegal;
      exports.applyMoveComplete = applyMoveComplete;
      var types_1 = require_types();
      var Position_1 = require_Position();
      var AttackDetector_1 = require_AttackDetector();
      var conversion_1 = require_conversion();
      var Board_1 = require_Board();
      var constants_1 = require_constants();
      var zobrist_1 = require_zobrist();
      function generateLegalMoves(board) {
        const pseudoLegalMoves = generatePseudoLegalMoves(board);
        const currentColor = board.turn;
        const ourKingBitboard = currentColor === types_1.InternalColor.WHITE ? board.whiteKing : board.blackKing;
        if (ourKingBitboard === 0n) {
          return pseudoLegalMoves;
        }
        return pseudoLegalMoves.filter((move) => {
          if (move.flags & types_1.MoveFlag.CASTLING) {
            return true;
          }
          const testBoard = (0, Board_1.copyBoard)(board);
          const originalTurn = testBoard.turn;
          makeMove(testBoard, move);
          const kingBitboardAfter = originalTurn === types_1.InternalColor.WHITE ? testBoard.whiteKing : testBoard.blackKing;
          if (kingBitboardAfter === 0n) {
            return true;
          }
          const kingSquare = (0, conversion_1.getLowestSetBit)(kingBitboardAfter);
          const opponentColor = originalTurn === types_1.InternalColor.WHITE ? types_1.InternalColor.BLACK : types_1.InternalColor.WHITE;
          return !(0, AttackDetector_1.isSquareAttacked)(testBoard, kingSquare, opponentColor);
        });
      }
      function makeMove(board, move) {
        if (move.flags & types_1.MoveFlag.CASTLING) {
          (0, Board_1.removePiece)(board, move.from);
          (0, Board_1.setPiece)(board, move.to, move.piece);
          const color = board.turn;
          if (color === types_1.InternalColor.WHITE) {
            if (move.to === constants_1.CASTLING.WHITE_SHORT.kingTo) {
              (0, Board_1.removePiece)(board, constants_1.CASTLING.WHITE_SHORT.rookFrom);
              (0, Board_1.setPiece)(board, constants_1.CASTLING.WHITE_SHORT.rookTo, types_1.Piece.WHITE_ROOK);
            } else {
              (0, Board_1.removePiece)(board, constants_1.CASTLING.WHITE_LONG.rookFrom);
              (0, Board_1.setPiece)(board, constants_1.CASTLING.WHITE_LONG.rookTo, types_1.Piece.WHITE_ROOK);
            }
          } else {
            if (move.to === constants_1.CASTLING.BLACK_SHORT.kingTo) {
              (0, Board_1.removePiece)(board, constants_1.CASTLING.BLACK_SHORT.rookFrom);
              (0, Board_1.setPiece)(board, constants_1.CASTLING.BLACK_SHORT.rookTo, types_1.Piece.BLACK_ROOK);
            } else {
              (0, Board_1.removePiece)(board, constants_1.CASTLING.BLACK_LONG.rookFrom);
              (0, Board_1.setPiece)(board, constants_1.CASTLING.BLACK_LONG.rookTo, types_1.Piece.BLACK_ROOK);
            }
          }
        } else if (move.flags & types_1.MoveFlag.EN_PASSANT) {
          (0, Board_1.removePiece)(board, move.from);
          (0, Board_1.setPiece)(board, move.to, move.piece);
          const capturedPawnSquare = board.turn === types_1.InternalColor.WHITE ? move.to - 8 : move.to + 8;
          (0, Board_1.removePiece)(board, capturedPawnSquare);
        } else if (move.flags & types_1.MoveFlag.PROMOTION) {
          (0, Board_1.removePiece)(board, move.from);
          if (move.capturedPiece !== types_1.Piece.EMPTY) {
            (0, Board_1.removePiece)(board, move.to);
          }
          (0, Board_1.setPiece)(board, move.to, move.promotionPiece);
        } else {
          (0, Board_1.removePiece)(board, move.from);
          if (move.capturedPiece !== types_1.Piece.EMPTY) {
            (0, Board_1.removePiece)(board, move.to);
          }
          (0, Board_1.setPiece)(board, move.to, move.piece);
        }
        if (move.flags & types_1.MoveFlag.PAWN_DOUBLE_PUSH) {
          const epSquare = board.turn === types_1.InternalColor.WHITE ? move.from + 8 : move.from - 8;
          board.enPassantSquare = epSquare;
        } else {
          board.enPassantSquare = null;
        }
        board.turn = board.turn === types_1.InternalColor.WHITE ? types_1.InternalColor.BLACK : types_1.InternalColor.WHITE;
      }
      function generatePseudoLegalMoves(board) {
        const moves = [];
        const color = board.turn;
        const friendlyPieces = color === types_1.InternalColor.WHITE ? board.whitePieces : board.blackPieces;
        const enemyPieces = color === types_1.InternalColor.WHITE ? board.blackPieces : board.whitePieces;
        generatePawnMoves(board, moves, color, friendlyPieces, enemyPieces);
        generateKnightMoves(board, moves, color, friendlyPieces);
        generateBishopMoves(board, moves, color, friendlyPieces);
        generateRookMoves(board, moves, color, friendlyPieces);
        generateQueenMoves(board, moves, color, friendlyPieces);
        generateKingMoves(board, moves, color, friendlyPieces);
        generateCastlingMoves(board, moves, color);
        return moves;
      }
      function generatePawnMoves(board, moves, color, _friendlyPieces, enemyPieces) {
        const pawns = color === types_1.InternalColor.WHITE ? board.whitePawns : board.blackPawns;
        const pawnPiece = color === types_1.InternalColor.WHITE ? types_1.Piece.WHITE_PAWN : types_1.Piece.BLACK_PAWN;
        const promotionRank = color === types_1.InternalColor.WHITE ? 7 : 0;
        const empty = ~board.allPieces;
        if (color === types_1.InternalColor.WHITE) {
          let singlePushBB = (0, Position_1.shiftNorth)(pawns) & empty;
          while (singlePushBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(singlePushBB);
            singlePushBB &= singlePushBB - 1n;
            const from = to - 8;
            const toRank = (0, conversion_1.getRankIndex)(to);
            if (toRank === promotionRank) {
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PROMOTION, types_1.Piece.WHITE_QUEEN));
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PROMOTION, types_1.Piece.WHITE_ROOK));
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PROMOTION, types_1.Piece.WHITE_BISHOP));
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PROMOTION, types_1.Piece.WHITE_KNIGHT));
            } else {
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.NONE));
            }
          }
          const doublePushSource = pawns & 0x000000000000ff00n;
          let doublePushBB = (0, Position_1.shiftNorth)((0, Position_1.shiftNorth)(doublePushSource) & empty) & empty;
          while (doublePushBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(doublePushBB);
            doublePushBB &= doublePushBB - 1n;
            const from = to - 16;
            moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PAWN_DOUBLE_PUSH));
          }
          let capturesNEBB = (0, Position_1.shiftNorthEast)(pawns) & enemyPieces;
          while (capturesNEBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(capturesNEBB);
            capturesNEBB &= capturesNEBB - 1n;
            const from = to - 9;
            const capturedPiece = (0, Board_1.getPiece)(board, to);
            const toRank = (0, conversion_1.getRankIndex)(to);
            if (toRank === promotionRank) {
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.WHITE_QUEEN));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.WHITE_ROOK));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.WHITE_BISHOP));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.WHITE_KNIGHT));
            } else {
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.CAPTURE));
            }
          }
          let capturesNWBB = (0, Position_1.shiftNorthWest)(pawns) & enemyPieces;
          while (capturesNWBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(capturesNWBB);
            capturesNWBB &= capturesNWBB - 1n;
            const from = to - 7;
            const capturedPiece = (0, Board_1.getPiece)(board, to);
            const toRank = (0, conversion_1.getRankIndex)(to);
            if (toRank === promotionRank) {
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.WHITE_QUEEN));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.WHITE_ROOK));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.WHITE_BISHOP));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.WHITE_KNIGHT));
            } else {
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.CAPTURE));
            }
          }
          if (board.enPassantSquare !== null) {
            const epSquare = board.enPassantSquare;
            const epTarget = 1n << BigInt(epSquare);
            const canCaptureEP = ((0, Position_1.shiftSouthWest)(epTarget) | (0, Position_1.shiftSouthEast)(epTarget)) & pawns;
            let epBB = canCaptureEP;
            while (epBB !== 0n) {
              const from = (0, conversion_1.getLowestSetBit)(epBB);
              epBB &= epBB - 1n;
              const capturedPiece = types_1.Piece.BLACK_PAWN;
              moves.push(createMove(from, epSquare, pawnPiece, capturedPiece, types_1.MoveFlag.EN_PASSANT | types_1.MoveFlag.CAPTURE));
            }
          }
        } else {
          let singlePushBB = (0, Position_1.shiftSouth)(pawns) & empty;
          while (singlePushBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(singlePushBB);
            singlePushBB &= singlePushBB - 1n;
            const from = to + 8;
            const toRank = (0, conversion_1.getRankIndex)(to);
            if (toRank === promotionRank) {
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PROMOTION, types_1.Piece.BLACK_QUEEN));
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PROMOTION, types_1.Piece.BLACK_ROOK));
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PROMOTION, types_1.Piece.BLACK_BISHOP));
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PROMOTION, types_1.Piece.BLACK_KNIGHT));
            } else {
              moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.NONE));
            }
          }
          const doublePushSource = pawns & 0x00ff000000000000n;
          let doublePushBB = (0, Position_1.shiftSouth)((0, Position_1.shiftSouth)(doublePushSource) & empty) & empty;
          while (doublePushBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(doublePushBB);
            doublePushBB &= doublePushBB - 1n;
            const from = to + 16;
            moves.push(createMove(from, to, pawnPiece, types_1.Piece.EMPTY, types_1.MoveFlag.PAWN_DOUBLE_PUSH));
          }
          let capturesSEBB = (0, Position_1.shiftSouthEast)(pawns) & enemyPieces;
          while (capturesSEBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(capturesSEBB);
            capturesSEBB &= capturesSEBB - 1n;
            const from = to + 7;
            const capturedPiece = (0, Board_1.getPiece)(board, to);
            const toRank = (0, conversion_1.getRankIndex)(to);
            if (toRank === promotionRank) {
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.BLACK_QUEEN));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.BLACK_ROOK));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.BLACK_BISHOP));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.BLACK_KNIGHT));
            } else {
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.CAPTURE));
            }
          }
          let capturesSWBB = (0, Position_1.shiftSouthWest)(pawns) & enemyPieces;
          while (capturesSWBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(capturesSWBB);
            capturesSWBB &= capturesSWBB - 1n;
            const from = to + 9;
            const capturedPiece = (0, Board_1.getPiece)(board, to);
            const toRank = (0, conversion_1.getRankIndex)(to);
            if (toRank === promotionRank) {
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.BLACK_QUEEN));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.BLACK_ROOK));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.BLACK_BISHOP));
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.PROMOTION | types_1.MoveFlag.CAPTURE, types_1.Piece.BLACK_KNIGHT));
            } else {
              moves.push(createMove(from, to, pawnPiece, capturedPiece, types_1.MoveFlag.CAPTURE));
            }
          }
          if (board.enPassantSquare !== null) {
            const epSquare = board.enPassantSquare;
            const epTarget = 1n << BigInt(epSquare);
            const canCaptureEP = ((0, Position_1.shiftNorthWest)(epTarget) | (0, Position_1.shiftNorthEast)(epTarget)) & pawns;
            let epBB = canCaptureEP;
            while (epBB !== 0n) {
              const from = (0, conversion_1.getLowestSetBit)(epBB);
              epBB &= epBB - 1n;
              const capturedPiece = types_1.Piece.WHITE_PAWN;
              moves.push(createMove(from, epSquare, pawnPiece, capturedPiece, types_1.MoveFlag.EN_PASSANT | types_1.MoveFlag.CAPTURE));
            }
          }
        }
      }
      function generateKnightMoves(board, moves, color, friendlyPieces) {
        const knights = color === types_1.InternalColor.WHITE ? board.whiteKnights : board.blackKnights;
        const knightPiece = color === types_1.InternalColor.WHITE ? types_1.Piece.WHITE_KNIGHT : types_1.Piece.BLACK_KNIGHT;
        let knightsBB = knights;
        while (knightsBB !== 0n) {
          const from = (0, conversion_1.getLowestSetBit)(knightsBB);
          const attacks = (0, Position_1.getKnightAttacks)(from) & ~friendlyPieces;
          let attacksBB = attacks;
          while (attacksBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(attacksBB);
            attacksBB &= attacksBB - 1n;
            const capturedPiece = (0, Board_1.getPiece)(board, to);
            const flags = capturedPiece !== types_1.Piece.EMPTY ? types_1.MoveFlag.CAPTURE : types_1.MoveFlag.NONE;
            moves.push(createMove(from, to, knightPiece, capturedPiece, flags));
          }
          knightsBB &= knightsBB - 1n;
        }
      }
      function generateBishopMoves(board, moves, color, friendlyPieces) {
        const bishops = color === types_1.InternalColor.WHITE ? board.whiteBishops : board.blackBishops;
        const bishopPiece = color === types_1.InternalColor.WHITE ? types_1.Piece.WHITE_BISHOP : types_1.Piece.BLACK_BISHOP;
        let bishopsBB = bishops;
        while (bishopsBB !== 0n) {
          const from = (0, conversion_1.getLowestSetBit)(bishopsBB);
          const attacks = (0, Position_1.getBishopAttacks)(from, board.allPieces) & ~friendlyPieces;
          let attacksBB = attacks;
          while (attacksBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(attacksBB);
            attacksBB &= attacksBB - 1n;
            const capturedPiece = (0, Board_1.getPiece)(board, to);
            const flags = capturedPiece !== types_1.Piece.EMPTY ? types_1.MoveFlag.CAPTURE : types_1.MoveFlag.NONE;
            moves.push(createMove(from, to, bishopPiece, capturedPiece, flags));
          }
          bishopsBB &= bishopsBB - 1n;
        }
      }
      function generateRookMoves(board, moves, color, friendlyPieces) {
        const rooks = color === types_1.InternalColor.WHITE ? board.whiteRooks : board.blackRooks;
        const rookPiece = color === types_1.InternalColor.WHITE ? types_1.Piece.WHITE_ROOK : types_1.Piece.BLACK_ROOK;
        let rooksBB = rooks;
        while (rooksBB !== 0n) {
          const from = (0, conversion_1.getLowestSetBit)(rooksBB);
          const attacks = (0, Position_1.getRookAttacks)(from, board.allPieces) & ~friendlyPieces;
          let attacksBB = attacks;
          while (attacksBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(attacksBB);
            attacksBB &= attacksBB - 1n;
            const capturedPiece = (0, Board_1.getPiece)(board, to);
            const flags = capturedPiece !== types_1.Piece.EMPTY ? types_1.MoveFlag.CAPTURE : types_1.MoveFlag.NONE;
            moves.push(createMove(from, to, rookPiece, capturedPiece, flags));
          }
          rooksBB &= rooksBB - 1n;
        }
      }
      function generateQueenMoves(board, moves, color, friendlyPieces) {
        const queens = color === types_1.InternalColor.WHITE ? board.whiteQueens : board.blackQueens;
        const queenPiece = color === types_1.InternalColor.WHITE ? types_1.Piece.WHITE_QUEEN : types_1.Piece.BLACK_QUEEN;
        let queensBB = queens;
        while (queensBB !== 0n) {
          const from = (0, conversion_1.getLowestSetBit)(queensBB);
          const attacks = (0, Position_1.getQueenAttacks)(from, board.allPieces) & ~friendlyPieces;
          let attacksBB = attacks;
          while (attacksBB !== 0n) {
            const to = (0, conversion_1.getLowestSetBit)(attacksBB);
            attacksBB &= attacksBB - 1n;
            const capturedPiece = (0, Board_1.getPiece)(board, to);
            const flags = capturedPiece !== types_1.Piece.EMPTY ? types_1.MoveFlag.CAPTURE : types_1.MoveFlag.NONE;
            moves.push(createMove(from, to, queenPiece, capturedPiece, flags));
          }
          queensBB &= queensBB - 1n;
        }
      }
      function generateKingMoves(board, moves, color, friendlyPieces) {
        const king = color === types_1.InternalColor.WHITE ? board.whiteKing : board.blackKing;
        const kingPiece = color === types_1.InternalColor.WHITE ? types_1.Piece.WHITE_KING : types_1.Piece.BLACK_KING;
        if (king === 0n)
          return;
        const from = (0, conversion_1.getLowestSetBit)(king);
        const attacks = (0, Position_1.getKingAttacks)(from) & ~friendlyPieces;
        let attacksBB = attacks;
        while (attacksBB !== 0n) {
          const to = (0, conversion_1.getLowestSetBit)(attacksBB);
          attacksBB &= attacksBB - 1n;
          const capturedPiece = (0, Board_1.getPiece)(board, to);
          const flags = capturedPiece !== types_1.Piece.EMPTY ? types_1.MoveFlag.CAPTURE : types_1.MoveFlag.NONE;
          moves.push(createMove(from, to, kingPiece, capturedPiece, flags));
        }
      }
      function generateCastlingMoves(board, moves, color) {
        const opponentColor = color === types_1.InternalColor.WHITE ? types_1.InternalColor.BLACK : types_1.InternalColor.WHITE;
        if (color === types_1.InternalColor.WHITE) {
          if (board.castlingRights.whiteShort && (0, Board_1.getPiece)(board, constants_1.CASTLING.WHITE_SHORT.kingFrom) === types_1.Piece.WHITE_KING && (0, Board_1.getPiece)(board, constants_1.CASTLING.WHITE_SHORT.rookFrom) === types_1.Piece.WHITE_ROOK && (0, Board_1.isSquareEmpty)(board, 5) && // F1
          (0, Board_1.isSquareEmpty)(board, 6) && // G1
          !(0, AttackDetector_1.isSquareAttacked)(board, 4, opponentColor) && // E1 not in check
          !(0, AttackDetector_1.isSquareAttacked)(board, 5, opponentColor) && // F1 not attacked
          !(0, AttackDetector_1.isSquareAttacked)(board, 6, opponentColor)) {
            moves.push(createMove(constants_1.CASTLING.WHITE_SHORT.kingFrom, constants_1.CASTLING.WHITE_SHORT.kingTo, types_1.Piece.WHITE_KING, types_1.Piece.EMPTY, types_1.MoveFlag.CASTLING));
          }
          if (board.castlingRights.whiteLong && (0, Board_1.getPiece)(board, constants_1.CASTLING.WHITE_LONG.kingFrom) === types_1.Piece.WHITE_KING && (0, Board_1.getPiece)(board, constants_1.CASTLING.WHITE_LONG.rookFrom) === types_1.Piece.WHITE_ROOK && (0, Board_1.isSquareEmpty)(board, 1) && // B1
          (0, Board_1.isSquareEmpty)(board, 2) && // C1
          (0, Board_1.isSquareEmpty)(board, 3) && // D1
          !(0, AttackDetector_1.isSquareAttacked)(board, 4, opponentColor) && // E1 not in check
          !(0, AttackDetector_1.isSquareAttacked)(board, 3, opponentColor) && // D1 not attacked
          !(0, AttackDetector_1.isSquareAttacked)(board, 2, opponentColor)) {
            moves.push(createMove(constants_1.CASTLING.WHITE_LONG.kingFrom, constants_1.CASTLING.WHITE_LONG.kingTo, types_1.Piece.WHITE_KING, types_1.Piece.EMPTY, types_1.MoveFlag.CASTLING));
          }
        } else {
          if (board.castlingRights.blackShort && (0, Board_1.getPiece)(board, constants_1.CASTLING.BLACK_SHORT.kingFrom) === types_1.Piece.BLACK_KING && (0, Board_1.getPiece)(board, constants_1.CASTLING.BLACK_SHORT.rookFrom) === types_1.Piece.BLACK_ROOK && (0, Board_1.isSquareEmpty)(board, 61) && // F8
          (0, Board_1.isSquareEmpty)(board, 62) && // G8
          !(0, AttackDetector_1.isSquareAttacked)(board, 60, opponentColor) && // E8 not in check
          !(0, AttackDetector_1.isSquareAttacked)(board, 61, opponentColor) && // F8 not attacked
          !(0, AttackDetector_1.isSquareAttacked)(board, 62, opponentColor)) {
            moves.push(createMove(constants_1.CASTLING.BLACK_SHORT.kingFrom, constants_1.CASTLING.BLACK_SHORT.kingTo, types_1.Piece.BLACK_KING, types_1.Piece.EMPTY, types_1.MoveFlag.CASTLING));
          }
          if (board.castlingRights.blackLong && (0, Board_1.getPiece)(board, constants_1.CASTLING.BLACK_LONG.kingFrom) === types_1.Piece.BLACK_KING && (0, Board_1.getPiece)(board, constants_1.CASTLING.BLACK_LONG.rookFrom) === types_1.Piece.BLACK_ROOK && (0, Board_1.isSquareEmpty)(board, 57) && // B8
          (0, Board_1.isSquareEmpty)(board, 58) && // C8
          (0, Board_1.isSquareEmpty)(board, 59) && // D8
          !(0, AttackDetector_1.isSquareAttacked)(board, 60, opponentColor) && // E8 not in check
          !(0, AttackDetector_1.isSquareAttacked)(board, 59, opponentColor) && // D8 not attacked
          !(0, AttackDetector_1.isSquareAttacked)(board, 58, opponentColor)) {
            moves.push(createMove(constants_1.CASTLING.BLACK_LONG.kingFrom, constants_1.CASTLING.BLACK_LONG.kingTo, types_1.Piece.BLACK_KING, types_1.Piece.EMPTY, types_1.MoveFlag.CASTLING));
          }
        }
      }
      function createMove(from, to, piece, capturedPiece, flags, promotionPiece) {
        return {
          from,
          to,
          piece,
          capturedPiece,
          flags,
          promotionPiece
        };
      }
      function getMovesForPiece(board, square) {
        const allMoves = generateLegalMoves(board);
        return allMoves.filter((move) => move.from === square);
      }
      function isMoveLegal(board, from, to) {
        const legalMoves = generateLegalMoves(board);
        return legalMoves.some((move) => move.from === from && move.to === to);
      }
      function applyMoveComplete(board, move) {
        const { from, to, piece, capturedPiece, flags, promotionPiece } = move;
        const oldEnPassant = board.enPassantSquare;
        const oldCastling = { ...board.castlingRights };
        board.enPassantSquare = null;
        if (capturedPiece !== types_1.Piece.EMPTY) {
          (0, Board_1.removePiece)(board, to);
          board.zobristHash = (0, zobrist_1.updateHashCapture)(board.zobristHash, capturedPiece, to);
          board.halfMoveClock = 0;
        } else {
          board.halfMoveClock++;
        }
        if (flags & types_1.MoveFlag.EN_PASSANT) {
          const captureSquare = board.turn === types_1.InternalColor.WHITE ? to - 8 : to + 8;
          const capturedPawn = board.turn === types_1.InternalColor.WHITE ? types_1.Piece.BLACK_PAWN : types_1.Piece.WHITE_PAWN;
          (0, Board_1.removePiece)(board, captureSquare);
          board.zobristHash = (0, zobrist_1.updateHashCapture)(board.zobristHash, capturedPawn, captureSquare);
          board.halfMoveClock = 0;
        }
        if (flags & types_1.MoveFlag.CASTLING) {
          if (to === constants_1.CASTLING.WHITE_SHORT.kingTo) {
            (0, Board_1.removePiece)(board, constants_1.CASTLING.WHITE_SHORT.rookFrom);
            (0, Board_1.setPiece)(board, constants_1.CASTLING.WHITE_SHORT.rookTo, types_1.Piece.WHITE_ROOK);
            board.zobristHash = (0, zobrist_1.updateHashMove)(board.zobristHash, types_1.Piece.WHITE_ROOK, constants_1.CASTLING.WHITE_SHORT.rookFrom, constants_1.CASTLING.WHITE_SHORT.rookTo);
          } else if (to === constants_1.CASTLING.WHITE_LONG.kingTo) {
            (0, Board_1.removePiece)(board, constants_1.CASTLING.WHITE_LONG.rookFrom);
            (0, Board_1.setPiece)(board, constants_1.CASTLING.WHITE_LONG.rookTo, types_1.Piece.WHITE_ROOK);
            board.zobristHash = (0, zobrist_1.updateHashMove)(board.zobristHash, types_1.Piece.WHITE_ROOK, constants_1.CASTLING.WHITE_LONG.rookFrom, constants_1.CASTLING.WHITE_LONG.rookTo);
          } else if (to === constants_1.CASTLING.BLACK_SHORT.kingTo) {
            (0, Board_1.removePiece)(board, constants_1.CASTLING.BLACK_SHORT.rookFrom);
            (0, Board_1.setPiece)(board, constants_1.CASTLING.BLACK_SHORT.rookTo, types_1.Piece.BLACK_ROOK);
            board.zobristHash = (0, zobrist_1.updateHashMove)(board.zobristHash, types_1.Piece.BLACK_ROOK, constants_1.CASTLING.BLACK_SHORT.rookFrom, constants_1.CASTLING.BLACK_SHORT.rookTo);
          } else if (to === constants_1.CASTLING.BLACK_LONG.kingTo) {
            (0, Board_1.removePiece)(board, constants_1.CASTLING.BLACK_LONG.rookFrom);
            (0, Board_1.setPiece)(board, constants_1.CASTLING.BLACK_LONG.rookTo, types_1.Piece.BLACK_ROOK);
            board.zobristHash = (0, zobrist_1.updateHashMove)(board.zobristHash, types_1.Piece.BLACK_ROOK, constants_1.CASTLING.BLACK_LONG.rookFrom, constants_1.CASTLING.BLACK_LONG.rookTo);
          }
        }
        (0, Board_1.removePiece)(board, from);
        board.zobristHash = (0, zobrist_1.updateHashMove)(board.zobristHash, piece, from, to);
        if (flags & types_1.MoveFlag.PROMOTION && promotionPiece) {
          board.zobristHash = (0, zobrist_1.removePieceFromHash)(board.zobristHash, piece, to);
          board.zobristHash = (0, zobrist_1.addPieceToHash)(board.zobristHash, promotionPiece, to);
          (0, Board_1.setPiece)(board, to, promotionPiece);
        } else {
          (0, Board_1.setPiece)(board, to, piece);
        }
        if (piece === types_1.Piece.WHITE_PAWN || piece === types_1.Piece.BLACK_PAWN) {
          board.halfMoveClock = 0;
        }
        if (flags & types_1.MoveFlag.PAWN_DOUBLE_PUSH) {
          const enPassantSquare = board.turn === types_1.InternalColor.WHITE ? from + 8 : from - 8;
          board.enPassantSquare = enPassantSquare;
        }
        updateCastlingRights(board, from, to, piece);
        board.zobristHash = (0, zobrist_1.updateHashEnPassant)(board.zobristHash, oldEnPassant, board.enPassantSquare);
        board.zobristHash = (0, zobrist_1.updateHashCastling)(board.zobristHash, oldCastling.whiteShort, board.castlingRights.whiteShort, oldCastling.whiteLong, board.castlingRights.whiteLong, oldCastling.blackShort, board.castlingRights.blackShort, oldCastling.blackLong, board.castlingRights.blackLong);
        board.turn = board.turn === types_1.InternalColor.WHITE ? types_1.InternalColor.BLACK : types_1.InternalColor.WHITE;
        board.zobristHash = (0, zobrist_1.toggleSide)(board.zobristHash);
        if (board.turn === types_1.InternalColor.WHITE) {
          board.fullMoveNumber++;
        }
        updateGameStatus(board);
        return move;
      }
      function updateCastlingRights(board, from, to, piece) {
        if (piece === types_1.Piece.WHITE_KING) {
          board.castlingRights.whiteShort = false;
          board.castlingRights.whiteLong = false;
        } else if (piece === types_1.Piece.BLACK_KING) {
          board.castlingRights.blackShort = false;
          board.castlingRights.blackLong = false;
        }
        if (piece === types_1.Piece.WHITE_ROOK) {
          if (from === constants_1.CASTLING.WHITE_SHORT.rookFrom) {
            board.castlingRights.whiteShort = false;
          } else if (from === constants_1.CASTLING.WHITE_LONG.rookFrom) {
            board.castlingRights.whiteLong = false;
          }
        } else if (piece === types_1.Piece.BLACK_ROOK) {
          if (from === constants_1.CASTLING.BLACK_SHORT.rookFrom) {
            board.castlingRights.blackShort = false;
          } else if (from === constants_1.CASTLING.BLACK_LONG.rookFrom) {
            board.castlingRights.blackLong = false;
          }
        }
        if (to === constants_1.CASTLING.WHITE_SHORT.rookFrom) {
          board.castlingRights.whiteShort = false;
        } else if (to === constants_1.CASTLING.WHITE_LONG.rookFrom) {
          board.castlingRights.whiteLong = false;
        } else if (to === constants_1.CASTLING.BLACK_SHORT.rookFrom) {
          board.castlingRights.blackShort = false;
        } else if (to === constants_1.CASTLING.BLACK_LONG.rookFrom) {
          board.castlingRights.blackLong = false;
        }
      }
      function updateGameStatus(board) {
        const currentColor = board.turn;
        const kingBitboard = currentColor === types_1.InternalColor.WHITE ? board.whiteKing : board.blackKing;
        if (kingBitboard === 0n) {
          board.isCheck = false;
          board.isCheckmate = false;
          board.isStalemate = false;
          return;
        }
        const kingSquare = (0, conversion_1.getLowestSetBit)(kingBitboard);
        const opponentColor = currentColor === types_1.InternalColor.WHITE ? types_1.InternalColor.BLACK : types_1.InternalColor.WHITE;
        const inCheck = (0, AttackDetector_1.isSquareAttacked)(board, kingSquare, opponentColor);
        board.isCheck = inCheck;
        board.isCheckmate = false;
        board.isStalemate = false;
      }
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/utils/fen.js
  var require_fen = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/utils/fen.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.parseFEN = parseFEN;
      exports.validateFEN = validateFEN;
      exports.toFEN = toFEN;
      exports.getStartingFEN = getStartingFEN;
      var types_1 = require_types();
      var Board_1 = require_Board();
      var AttackDetector_1 = require_AttackDetector();
      var zobrist_1 = require_zobrist();
      var conversion_1 = require_conversion();
      var FEN_CASTLING_RE = /^(-|[KQkq]{1,4})$/;
      var FEN_EN_PASSANT_RE = /^(-|[a-h][36])$/;
      function parseFEN(fen) {
        const parts = fen.trim().split(/\s+/);
        if (parts.length !== 6) {
          throw new Error(`Invalid FEN: expected 6 parts, got ${parts.length}`);
        }
        const [piecePlacement, activeColor, castling, enPassant, halfMove, fullMove] = parts;
        const board = (0, Board_1.createEmptyBoard)();
        const ranks = piecePlacement.split("/");
        if (ranks.length !== 8) {
          throw new Error(`Invalid FEN: expected 8 ranks, got ${ranks.length}`);
        }
        for (let rank = 0; rank < 8; rank++) {
          const rankStr = ranks[rank];
          let file = 0;
          for (const char of rankStr) {
            if (char >= "1" && char <= "8") {
              file += parseInt(char, 10);
            } else {
              const piece = fenCharToPiece(char);
              if (piece === null) {
                throw new Error(`Invalid FEN: unknown piece character '${char}'`);
              }
              const squareIndex = (7 - rank) * 8 + file;
              (0, Board_1.setPiece)(board, squareIndex, piece);
              file++;
            }
          }
          if (file !== 8) {
            throw new Error(`Invalid FEN: rank ${8 - rank} has ${file} files instead of 8`);
          }
        }
        let whiteKings = 0;
        let blackKings = 0;
        for (const p of board.mailbox) {
          if (p === types_1.Piece.WHITE_KING)
            whiteKings++;
          if (p === types_1.Piece.BLACK_KING)
            blackKings++;
        }
        if (whiteKings !== 1 || blackKings !== 1) {
          throw new Error(`Invalid FEN: expected exactly one white king and one black king`);
        }
        if (activeColor === "w") {
          board.turn = types_1.InternalColor.WHITE;
        } else if (activeColor === "b") {
          board.turn = types_1.InternalColor.BLACK;
        } else {
          throw new Error(`Invalid FEN: unknown active color '${activeColor}'`);
        }
        if (!FEN_CASTLING_RE.test(castling)) {
          throw new Error(`Invalid FEN: invalid castling rights '${castling}'`);
        }
        if (castling !== "-") {
          const unique = new Set(castling.split(""));
          if (unique.size !== castling.length) {
            throw new Error(`Invalid FEN: duplicate castling rights '${castling}'`);
          }
        }
        board.castlingRights.whiteShort = castling.includes("K");
        board.castlingRights.whiteLong = castling.includes("Q");
        board.castlingRights.blackShort = castling.includes("k");
        board.castlingRights.blackLong = castling.includes("q");
        if (!FEN_EN_PASSANT_RE.test(enPassant)) {
          throw new Error(`Invalid FEN: invalid en passant square '${enPassant}'`);
        }
        if (enPassant !== "-") {
          board.enPassantSquare = (0, conversion_1.squareToIndex)(enPassant.toUpperCase());
        }
        board.halfMoveClock = parseInt(halfMove, 10);
        if (isNaN(board.halfMoveClock)) {
          throw new Error(`Invalid FEN: invalid half-move clock '${halfMove}'`);
        }
        if (board.halfMoveClock < 0) {
          throw new Error(`Invalid FEN: half-move clock must be >= 0`);
        }
        board.fullMoveNumber = parseInt(fullMove, 10);
        if (isNaN(board.fullMoveNumber)) {
          throw new Error(`Invalid FEN: invalid full move number '${fullMove}'`);
        }
        if (board.fullMoveNumber < 1) {
          throw new Error(`Invalid FEN: full move number must be >= 1`);
        }
        board.zobristHash = (0, zobrist_1.computeZobristHash)(board);
        const notToMove = board.turn === types_1.InternalColor.WHITE ? types_1.InternalColor.BLACK : types_1.InternalColor.WHITE;
        const originalTurn = board.turn;
        try {
          board.turn = notToMove;
          if ((0, AttackDetector_1.isKingInCheck)(board)) {
            const side = notToMove === types_1.InternalColor.WHITE ? "white" : "black";
            throw new Error(`Invalid FEN: ${side} is in check but it is not ${side}'s turn`);
          }
        } finally {
          board.turn = originalTurn;
        }
        return board;
      }
      function validateFEN(fen) {
        parseFEN(fen);
      }
      function toFEN(board) {
        const parts = [];
        const rankStrings = [];
        for (let rank = 7; rank >= 0; rank--) {
          let rankStr = "";
          let emptyCount = 0;
          for (let file = 0; file < 8; file++) {
            const squareIndex = rank * 8 + file;
            const piece = board.mailbox[squareIndex];
            if (piece === types_1.Piece.EMPTY) {
              emptyCount++;
            } else {
              if (emptyCount > 0) {
                rankStr += emptyCount.toString();
                emptyCount = 0;
              }
              rankStr += pieceToFenChar(piece);
            }
          }
          if (emptyCount > 0) {
            rankStr += emptyCount.toString();
          }
          rankStrings.push(rankStr);
        }
        parts.push(rankStrings.join("/"));
        parts.push(board.turn === types_1.InternalColor.WHITE ? "w" : "b");
        let castling = "";
        if (board.castlingRights.whiteShort)
          castling += "K";
        if (board.castlingRights.whiteLong)
          castling += "Q";
        if (board.castlingRights.blackShort)
          castling += "k";
        if (board.castlingRights.blackLong)
          castling += "q";
        parts.push(castling || "-");
        if (board.enPassantSquare !== null) {
          parts.push((0, conversion_1.indexToSquare)(board.enPassantSquare).toLowerCase());
        } else {
          parts.push("-");
        }
        parts.push(board.halfMoveClock.toString());
        parts.push(board.fullMoveNumber.toString());
        return parts.join(" ");
      }
      function fenCharToPiece(char) {
        switch (char) {
          case "K":
            return types_1.Piece.WHITE_KING;
          case "Q":
            return types_1.Piece.WHITE_QUEEN;
          case "R":
            return types_1.Piece.WHITE_ROOK;
          case "B":
            return types_1.Piece.WHITE_BISHOP;
          case "N":
            return types_1.Piece.WHITE_KNIGHT;
          case "P":
            return types_1.Piece.WHITE_PAWN;
          case "k":
            return types_1.Piece.BLACK_KING;
          case "q":
            return types_1.Piece.BLACK_QUEEN;
          case "r":
            return types_1.Piece.BLACK_ROOK;
          case "b":
            return types_1.Piece.BLACK_BISHOP;
          case "n":
            return types_1.Piece.BLACK_KNIGHT;
          case "p":
            return types_1.Piece.BLACK_PAWN;
          default:
            return null;
        }
      }
      function pieceToFenChar(piece) {
        switch (piece) {
          case types_1.Piece.WHITE_KING:
            return "K";
          case types_1.Piece.WHITE_QUEEN:
            return "Q";
          case types_1.Piece.WHITE_ROOK:
            return "R";
          case types_1.Piece.WHITE_BISHOP:
            return "B";
          case types_1.Piece.WHITE_KNIGHT:
            return "N";
          case types_1.Piece.WHITE_PAWN:
            return "P";
          case types_1.Piece.BLACK_KING:
            return "k";
          case types_1.Piece.BLACK_QUEEN:
            return "q";
          case types_1.Piece.BLACK_ROOK:
            return "r";
          case types_1.Piece.BLACK_BISHOP:
            return "b";
          case types_1.Piece.BLACK_KNIGHT:
            return "n";
          case types_1.Piece.BLACK_PAWN:
            return "p";
          default:
            return "";
        }
      }
      function getStartingFEN() {
        return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      }
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/Evaluator.js
  var require_Evaluator = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/Evaluator.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.Evaluator = exports.SCORE_MAX = exports.SCORE_MIN = void 0;
      var types_1 = require_types();
      exports.SCORE_MIN = -1e6;
      exports.SCORE_MAX = 1e6;
      var V = {
        [types_1.Piece.EMPTY]: 0,
        [types_1.Piece.WHITE_PAWN]: 100,
        [types_1.Piece.BLACK_PAWN]: 100,
        [types_1.Piece.WHITE_KNIGHT]: 320,
        [types_1.Piece.BLACK_KNIGHT]: 320,
        [types_1.Piece.WHITE_BISHOP]: 320,
        [types_1.Piece.BLACK_BISHOP]: 320,
        [types_1.Piece.WHITE_ROOK]: 500,
        [types_1.Piece.BLACK_ROOK]: 500,
        [types_1.Piece.WHITE_QUEEN]: 900,
        [types_1.Piece.BLACK_QUEEN]: 900,
        [types_1.Piece.WHITE_KING]: 0,
        [types_1.Piece.BLACK_KING]: 0
      };
      var PST_PAWN = new Int16Array([
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        10,
        2,
        2,
        4,
        6,
        6,
        4,
        2,
        2,
        1,
        1,
        2,
        8,
        8,
        2,
        1,
        1,
        0,
        0,
        0,
        6,
        6,
        0,
        0,
        0,
        1,
        1,
        1,
        -2,
        -2,
        1,
        1,
        1,
        1,
        1,
        1,
        -4,
        -4,
        1,
        1,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ]);
      var PST_KNIGHT = new Int16Array([
        -20,
        -10,
        -10,
        -10,
        -10,
        -10,
        -10,
        -20,
        -10,
        0,
        0,
        0,
        0,
        0,
        0,
        -10,
        -10,
        0,
        5,
        6,
        6,
        5,
        0,
        -10,
        -10,
        2,
        6,
        8,
        8,
        6,
        2,
        -10,
        -10,
        0,
        6,
        8,
        8,
        6,
        0,
        -10,
        -10,
        2,
        4,
        6,
        6,
        4,
        2,
        -10,
        -10,
        0,
        0,
        0,
        0,
        0,
        0,
        -10,
        -20,
        -10,
        -10,
        -10,
        -10,
        -10,
        -10,
        -20
      ]);
      var PST_BISHOP = new Int16Array([
        -10,
        -5,
        -5,
        -5,
        -5,
        -5,
        -5,
        -10,
        -5,
        0,
        0,
        0,
        0,
        0,
        0,
        -5,
        -5,
        0,
        3,
        5,
        5,
        3,
        0,
        -5,
        -5,
        2,
        5,
        7,
        7,
        5,
        2,
        -5,
        -5,
        0,
        5,
        7,
        7,
        5,
        0,
        -5,
        -5,
        2,
        3,
        5,
        5,
        3,
        2,
        -5,
        -5,
        0,
        0,
        0,
        0,
        0,
        0,
        -5,
        -10,
        -5,
        -5,
        -5,
        -5,
        -5,
        -5,
        -10
      ]);
      var PST_ROOK = new Int16Array([
        0,
        0,
        2,
        4,
        4,
        2,
        0,
        0,
        0,
        0,
        2,
        4,
        4,
        2,
        0,
        0,
        0,
        0,
        2,
        4,
        4,
        2,
        0,
        0,
        0,
        0,
        2,
        4,
        4,
        2,
        0,
        0,
        0,
        0,
        2,
        4,
        4,
        2,
        0,
        0,
        2,
        2,
        4,
        6,
        6,
        4,
        2,
        2,
        5,
        5,
        5,
        7,
        7,
        5,
        5,
        5,
        0,
        0,
        2,
        4,
        4,
        2,
        0,
        0
      ]);
      var PST_QUEEN = new Int16Array([
        -10,
        -5,
        -5,
        -2,
        -2,
        -5,
        -5,
        -10,
        -5,
        0,
        0,
        0,
        0,
        0,
        0,
        -5,
        -5,
        0,
        2,
        2,
        2,
        2,
        0,
        -5,
        -2,
        0,
        2,
        3,
        3,
        2,
        0,
        -2,
        -2,
        0,
        2,
        3,
        3,
        2,
        0,
        -2,
        -5,
        0,
        2,
        2,
        2,
        2,
        0,
        -5,
        -5,
        0,
        0,
        0,
        0,
        0,
        0,
        -5,
        -10,
        -5,
        -5,
        -2,
        -2,
        -5,
        -5,
        -10
      ]);
      var PST_KING = new Int16Array([
        -30,
        -40,
        -40,
        -50,
        -50,
        -40,
        -40,
        -30,
        -30,
        -40,
        -40,
        -50,
        -50,
        -40,
        -40,
        -30,
        -30,
        -40,
        -40,
        -50,
        -50,
        -40,
        -40,
        -30,
        -30,
        -40,
        -40,
        -50,
        -50,
        -40,
        -40,
        -30,
        -20,
        -30,
        -30,
        -40,
        -40,
        -30,
        -30,
        -20,
        -10,
        -20,
        -20,
        -20,
        -20,
        -20,
        -20,
        -10,
        10,
        10,
        0,
        0,
        0,
        0,
        10,
        10,
        20,
        30,
        10,
        0,
        0,
        10,
        30,
        20
      ]);
      function mirrorSquare(sq) {
        const rank = sq / 8 | 0;
        const file = sq & 7;
        return (7 - rank) * 8 + file;
      }
      function pst(piece, square) {
        const isWhite = piece >= types_1.Piece.WHITE_PAWN && piece <= types_1.Piece.WHITE_KING;
        const sq = isWhite ? mirrorSquare(square) : square;
        switch (piece) {
          case types_1.Piece.WHITE_PAWN:
          case types_1.Piece.BLACK_PAWN:
            return PST_PAWN[sq];
          case types_1.Piece.WHITE_KNIGHT:
          case types_1.Piece.BLACK_KNIGHT:
            return PST_KNIGHT[sq];
          case types_1.Piece.WHITE_BISHOP:
          case types_1.Piece.BLACK_BISHOP:
            return PST_BISHOP[sq];
          case types_1.Piece.WHITE_ROOK:
          case types_1.Piece.BLACK_ROOK:
            return PST_ROOK[sq];
          case types_1.Piece.WHITE_QUEEN:
          case types_1.Piece.BLACK_QUEEN:
            return PST_QUEEN[sq];
          case types_1.Piece.WHITE_KING:
          case types_1.Piece.BLACK_KING:
            return PST_KING[sq];
          default:
            return 0;
        }
      }
      var Evaluator = class {
        static evaluate(board, playerColor, plyFromRoot = 0) {
          if (board.isCheckmate) {
            const losing = board.turn === playerColor;
            return losing ? exports.SCORE_MIN + plyFromRoot : exports.SCORE_MAX - plyFromRoot;
          }
          if (board.isStalemate)
            return 0;
          let white = 0;
          let black = 0;
          const mb = board.mailbox;
          for (let sq = 0; sq < 64; sq++) {
            const p = mb[sq];
            if (!p)
              continue;
            const val = (V[p] ?? 0) + pst(p, sq);
            if (p <= types_1.Piece.WHITE_KING)
              white += val;
            else
              black += val;
          }
          const scoreFromWhite = white - black;
          return playerColor === types_1.InternalColor.WHITE ? scoreFromWhite : -scoreFromWhite;
        }
      };
      exports.Evaluator = Evaluator;
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/utils/environment.js
  var require_environment = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/utils/environment.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.isNodeEnvironment = isNodeEnvironment;
      exports.isBrowserEnvironment = isBrowserEnvironment;
      exports.getDefaultTTSize = getDefaultTTSize;
      function isNodeEnvironment() {
        return typeof process !== "undefined" && process.versions != null && process.versions.node != null;
      }
      function isBrowserEnvironment() {
        return !isNodeEnvironment();
      }
      function getDefaultTTSize() {
        return isNodeEnvironment() ? 4 : 2;
      }
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/TranspositionTable.js
  var require_TranspositionTable = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/TranspositionTable.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.TranspositionTable = exports.TTEntryType = void 0;
      exports.getRecommendedTTSize = getRecommendedTTSize;
      var Evaluator_1 = require_Evaluator();
      var environment_1 = require_environment();
      var MATE_THRESHOLD = 500;
      function getRecommendedTTSize(level) {
        if ((0, environment_1.isNodeEnvironment)()) {
          const nodeSizes = {
            1: 0.5,
            // Level 1: 0.5 MB
            2: 1,
            // Level 2: 1 MB
            3: 4,
            // Level 3: 4 MB (default)
            4: 16,
            // Level 4: 16 MB
            5: 40
            // Level 5: 40 MB
          };
          return nodeSizes[level] ?? 4;
        } else {
          const browserSizes = {
            1: 0.25,
            // Level 1: 0.25 MB (ultra-lightweight)
            2: 0.5,
            // Level 2: 0.5 MB (mobile-friendly)
            3: 2,
            // Level 3: 2 MB (balanced default)
            4: 8,
            // Level 4: 8 MB (strong performance)
            5: 20
            // Level 5: 20 MB (maximum strength)
          };
          return browserSizes[level] ?? 2;
        }
      }
      function adjustMateScoreForStorage(score, ply) {
        if (score > Evaluator_1.SCORE_MAX - MATE_THRESHOLD)
          return score + ply;
        if (score < Evaluator_1.SCORE_MIN + MATE_THRESHOLD)
          return score - ply;
        return score;
      }
      function adjustMateScoreForRetrieval(score, ply) {
        if (score > Evaluator_1.SCORE_MAX - MATE_THRESHOLD)
          return score - ply;
        if (score < Evaluator_1.SCORE_MIN + MATE_THRESHOLD)
          return score + ply;
        return score;
      }
      var TTEntryType;
      (function(TTEntryType2) {
        TTEntryType2[TTEntryType2["EXACT"] = 0] = "EXACT";
        TTEntryType2[TTEntryType2["LOWER_BOUND"] = 1] = "LOWER_BOUND";
        TTEntryType2[TTEntryType2["UPPER_BOUND"] = 2] = "UPPER_BOUND";
      })(TTEntryType || (exports.TTEntryType = TTEntryType = {}));
      var TranspositionTable = class {
        /**
         * Create a new transposition table
         *
         * @param sizeMB - Size in megabytes (default: 16MB)
         */
        constructor(sizeMB = 16) {
          __publicField(this, "table");
          __publicField(this, "size");
          __publicField(this, "currentAge", 0);
          __publicField(this, "hits", 0);
          __publicField(this, "misses", 0);
          const entrySize = 40;
          const bytesPerMB = 1024 * 1024;
          const totalBytes = sizeMB * bytesPerMB;
          this.size = Math.pow(2, Math.floor(Math.log2(totalBytes / entrySize)));
          this.table = new Array(this.size).fill(null);
        }
        /**
         * Store a position in the transposition table
         *
         * @param zobristHash - Position hash
         * @param depth - Search depth
         * @param score - Position score
         * @param type - Entry type
         * @param bestMove - Best move found
         */
        store(zobristHash, depth, score, type, bestMove, ply = 0) {
          const index = this.getIndex(zobristHash);
          const existingEntry = this.table[index];
          const shouldReplace = !existingEntry || existingEntry.zobristHash === zobristHash || depth >= existingEntry.depth || existingEntry.age < this.currentAge;
          if (shouldReplace) {
            this.table[index] = {
              zobristHash,
              depth,
              score: adjustMateScoreForStorage(score, ply),
              type,
              bestMove,
              age: this.currentAge
            };
          }
        }
        /**
         * Probe the transposition table
         *
         * @param zobristHash - Position hash
         * @param depth - Current search depth
         * @param alpha - Alpha bound
         * @param beta - Beta bound
         * @returns Entry if found and usable, null otherwise
         */
        probe(zobristHash, depth, alpha, beta, ply = 0) {
          const index = this.getIndex(zobristHash);
          const entry = this.table[index];
          if (!entry || entry.zobristHash !== zobristHash) {
            this.misses++;
            return null;
          }
          if (entry.depth < depth) {
            this.misses++;
            return null;
          }
          const adjustedScore = adjustMateScoreForRetrieval(entry.score, ply);
          switch (entry.type) {
            case TTEntryType.EXACT:
              this.hits++;
              return { ...entry, score: adjustedScore };
            case TTEntryType.LOWER_BOUND:
              if (adjustedScore >= beta) {
                this.hits++;
                return { ...entry, score: adjustedScore };
              }
              break;
            case TTEntryType.UPPER_BOUND:
              if (adjustedScore <= alpha) {
                this.hits++;
                return { ...entry, score: adjustedScore };
              }
              break;
          }
          return { ...entry, score: adjustedScore };
        }
        /**
         * Get best move from transposition table (for move ordering)
         *
         * @param zobristHash - Position hash
         * @returns Best move if found, null otherwise
         */
        getBestMove(zobristHash) {
          const index = this.getIndex(zobristHash);
          const entry = this.table[index];
          if (entry && entry.zobristHash === zobristHash) {
            return entry.bestMove;
          }
          return null;
        }
        /**
         * Clear the transposition table
         */
        clear() {
          this.table.fill(null);
          this.currentAge = 0;
          this.hits = 0;
          this.misses = 0;
        }
        /**
         * Increment search age (call at start of new search)
         */
        newSearch() {
          this.currentAge++;
        }
        /**
         * Get index for a hash value
         *
         * @param hash - Zobrist hash
         * @returns Table index
         */
        getIndex(hash) {
          return Number(hash & BigInt(this.size - 1));
        }
        /**
         * Get cache statistics
         *
         * @returns Statistics object
         */
        getStats() {
          const total = this.hits + this.misses;
          const hitRate = total > 0 ? this.hits / total : 0;
          return {
            hits: this.hits,
            misses: this.misses,
            hitRate,
            size: this.size
          };
        }
      };
      exports.TranspositionTable = TranspositionTable;
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/adapters/APIAdapter.js
  var require_APIAdapter = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/adapters/APIAdapter.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.boardToConfig = boardToConfig;
      exports.configToBoard = configToBoard;
      exports.configToFEN = configToFEN;
      exports.movesToMap = movesToMap;
      exports.movesFromSquare = movesFromSquare;
      exports.pieceToSymbol = pieceToSymbol;
      exports.symbolToPiece = symbolToPiece;
      exports.colorToInternal = colorToInternal;
      exports.internalToColor = internalToColor;
      exports.normalizeSquare = normalizeSquare;
      var types_1 = require_types();
      var conversion_1 = require_conversion();
      function boardToConfig(board) {
        const pieces = {};
        for (let i = 0; i < 64; i++) {
          const piece = board.mailbox[i];
          if (piece !== types_1.Piece.EMPTY) {
            const square = (0, conversion_1.indexToSquare)(i);
            const symbol = pieceToSymbol(piece);
            if (symbol) {
              pieces[square] = symbol;
            }
          }
        }
        return {
          pieces,
          turn: board.turn === types_1.InternalColor.WHITE ? "white" : "black",
          isFinished: board.isCheckmate || board.isStalemate,
          check: board.isCheck,
          checkMate: board.isCheckmate,
          staleMate: board.isStalemate,
          castling: { ...board.castlingRights },
          enPassant: board.enPassantSquare !== null ? (0, conversion_1.indexToSquare)(board.enPassantSquare) : null,
          halfMove: board.halfMoveClock,
          fullMove: board.fullMoveNumber
        };
      }
      function configToBoard(config) {
        const { parseFEN } = require_fen();
        const fen = configToFEN(config);
        return parseFEN(fen);
      }
      function configToFEN(config) {
        const ranks = [];
        for (let rank = 7; rank >= 0; rank--) {
          let rankStr = "";
          let emptyCount = 0;
          for (let file = 0; file < 8; file++) {
            const square = (0, conversion_1.indexToSquare)(rank * 8 + file);
            const piece = config.pieces[square];
            if (!piece) {
              emptyCount++;
            } else {
              if (emptyCount > 0) {
                rankStr += emptyCount.toString();
                emptyCount = 0;
              }
              rankStr += piece;
            }
          }
          if (emptyCount > 0) {
            rankStr += emptyCount.toString();
          }
          ranks.push(rankStr);
        }
        const piecePlacement = ranks.join("/");
        const activeColor = config.turn === "white" ? "w" : "b";
        let castling = "";
        if (config.castling.whiteShort)
          castling += "K";
        if (config.castling.whiteLong)
          castling += "Q";
        if (config.castling.blackShort)
          castling += "k";
        if (config.castling.blackLong)
          castling += "q";
        if (!castling)
          castling = "-";
        const enPassant = config.enPassant ? config.enPassant.toLowerCase() : "-";
        const halfMove = config.halfMove.toString();
        const fullMove = config.fullMove.toString();
        return `${piecePlacement} ${activeColor} ${castling} ${enPassant} ${halfMove} ${fullMove}`;
      }
      function movesToMap(moves) {
        const movesMap = {};
        for (const move of moves) {
          const fromSquare = (0, conversion_1.indexToSquare)(move.from);
          const toSquare = (0, conversion_1.indexToSquare)(move.to);
          if (!movesMap[fromSquare]) {
            movesMap[fromSquare] = [];
          }
          movesMap[fromSquare].push(toSquare);
        }
        return movesMap;
      }
      function movesFromSquare(moves, fromIndex) {
        return moves.filter((move) => move.from === fromIndex).map((move) => (0, conversion_1.indexToSquare)(move.to));
      }
      function pieceToSymbol(piece) {
        switch (piece) {
          case types_1.Piece.WHITE_KING:
            return "K";
          case types_1.Piece.WHITE_QUEEN:
            return "Q";
          case types_1.Piece.WHITE_ROOK:
            return "R";
          case types_1.Piece.WHITE_BISHOP:
            return "B";
          case types_1.Piece.WHITE_KNIGHT:
            return "N";
          case types_1.Piece.WHITE_PAWN:
            return "P";
          case types_1.Piece.BLACK_KING:
            return "k";
          case types_1.Piece.BLACK_QUEEN:
            return "q";
          case types_1.Piece.BLACK_ROOK:
            return "r";
          case types_1.Piece.BLACK_BISHOP:
            return "b";
          case types_1.Piece.BLACK_KNIGHT:
            return "n";
          case types_1.Piece.BLACK_PAWN:
            return "p";
          default:
            return null;
        }
      }
      function symbolToPiece(symbol) {
        switch (symbol) {
          case "K":
            return types_1.Piece.WHITE_KING;
          case "Q":
            return types_1.Piece.WHITE_QUEEN;
          case "R":
            return types_1.Piece.WHITE_ROOK;
          case "B":
            return types_1.Piece.WHITE_BISHOP;
          case "N":
            return types_1.Piece.WHITE_KNIGHT;
          case "P":
            return types_1.Piece.WHITE_PAWN;
          case "k":
            return types_1.Piece.BLACK_KING;
          case "q":
            return types_1.Piece.BLACK_QUEEN;
          case "r":
            return types_1.Piece.BLACK_ROOK;
          case "b":
            return types_1.Piece.BLACK_BISHOP;
          case "n":
            return types_1.Piece.BLACK_KNIGHT;
          case "p":
            return types_1.Piece.BLACK_PAWN;
        }
      }
      function colorToInternal(color) {
        return color === "white" ? types_1.InternalColor.WHITE : types_1.InternalColor.BLACK;
      }
      function internalToColor(color) {
        return color === types_1.InternalColor.WHITE ? "white" : "black";
      }
      function normalizeSquare(square) {
        return square.toUpperCase();
      }
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/MoveOrdering.js
  var require_MoveOrdering = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/MoveOrdering.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.MoveSelector = exports.KillerMoves = void 0;
      var types_1 = require_types();
      var PIECE_VALUE = {
        [types_1.Piece.EMPTY]: 0,
        [types_1.Piece.WHITE_PAWN]: 100,
        [types_1.Piece.BLACK_PAWN]: 100,
        [types_1.Piece.WHITE_KNIGHT]: 320,
        [types_1.Piece.BLACK_KNIGHT]: 320,
        [types_1.Piece.WHITE_BISHOP]: 320,
        [types_1.Piece.BLACK_BISHOP]: 320,
        [types_1.Piece.WHITE_ROOK]: 500,
        [types_1.Piece.BLACK_ROOK]: 500,
        [types_1.Piece.WHITE_QUEEN]: 900,
        [types_1.Piece.BLACK_QUEEN]: 900,
        [types_1.Piece.WHITE_KING]: 2e4,
        [types_1.Piece.BLACK_KING]: 2e4
      };
      var KillerMoves = class {
        constructor(maxPly = 64) {
          __publicField(this, "killers");
          __publicField(this, "maxPly");
          this.maxPly = maxPly;
          this.killers = Array.from({ length: maxPly }, () => [null, null]);
        }
        clear() {
          this.killers = Array.from({ length: this.maxPly }, () => [null, null]);
        }
        store(move, ply) {
          if (ply < 0 || ply >= this.maxPly)
            return;
          if (move.flags & types_1.MoveFlag.CAPTURE)
            return;
          const k1 = this.killers[ply][0];
          if (k1 && k1.from === move.from && k1.to === move.to)
            return;
          this.killers[ply][1] = k1;
          this.killers[ply][0] = move;
        }
        isKiller(move, ply) {
          if (ply < 0 || ply >= this.maxPly)
            return false;
          const [k1, k2] = this.killers[ply];
          return !!(k1 && k1.from === move.from && k1.to === move.to || k2 && k2.from === move.from && k2.to === move.to);
        }
      };
      exports.KillerMoves = KillerMoves;
      function mvvLvaScore(move) {
        const victim = PIECE_VALUE[move.capturedPiece] ?? 0;
        const attacker = PIECE_VALUE[move.piece] ?? 0;
        return victim * 16 - attacker;
      }
      var MoveSelector = class {
        constructor(moves, ttMove, killers, ply) {
          __publicField(this, "moves");
          __publicField(this, "scores");
          __publicField(this, "n");
          __publicField(this, "cursor", 0);
          this.moves = moves;
          this.n = moves.length;
          const scores = new Int32Array(this.n);
          for (let i = 0; i < this.n; i++) {
            const m = moves[i];
            let score = 0;
            if (ttMove && m.from === ttMove.from && m.to === ttMove.to) {
              score += 1e7;
            }
            if (m.flags & types_1.MoveFlag.PROMOTION && (m.promotionPiece === types_1.Piece.WHITE_QUEEN || m.promotionPiece === types_1.Piece.BLACK_QUEEN)) {
              score += 9e6;
            }
            if (m.flags & types_1.MoveFlag.CAPTURE) {
              score += 5e6 + mvvLvaScore(m);
            }
            if (killers && killers.isKiller(m, ply)) {
              score += 3e6;
            }
            scores[i] = score;
          }
          this.scores = scores;
        }
        /** Return the next best move, or null when exhausted. */
        pickNext() {
          const { cursor, n, scores, moves } = this;
          if (cursor >= n)
            return null;
          let bestIdx = cursor;
          let bestScore = scores[cursor];
          for (let j = cursor + 1; j < n; j++) {
            if (scores[j] > bestScore) {
              bestScore = scores[j];
              bestIdx = j;
            }
          }
          if (bestIdx !== cursor) {
            const tmpMove = moves[cursor];
            moves[cursor] = moves[bestIdx];
            moves[bestIdx] = tmpMove;
            scores[bestIdx] = scores[cursor];
          }
          this.cursor++;
          return moves[cursor];
        }
      };
      exports.MoveSelector = MoveSelector;
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/Search.js
  var require_Search = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/Search.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.Search = void 0;
      var types_1 = require_types();
      var MoveGenerator_1 = require_MoveGenerator();
      var Board_1 = require_Board();
      var AttackDetector_1 = require_AttackDetector();
      var conversion_1 = require_conversion();
      var Evaluator_1 = require_Evaluator();
      var TranspositionTable_1 = require_TranspositionTable();
      var MoveOrdering_1 = require_MoveOrdering();
      var INF = Evaluator_1.SCORE_MAX;
      var Search = class {
        constructor(ttSizeMB = 16) {
          __publicField(this, "nodesSearched", 0);
          __publicField(this, "qMaxDepth", 4);
          __publicField(this, "checkExtension", true);
          __publicField(this, "transpositionTable");
          __publicField(this, "killerMoves");
          this.transpositionTable = ttSizeMB > 0 ? new TranspositionTable_1.TranspositionTable(ttSizeMB) : null;
          this.killerMoves = new MoveOrdering_1.KillerMoves();
        }
        clear() {
          this.transpositionTable?.clear();
          this.killerMoves.clear();
        }
        findBestMove(board, baseDepth, qMaxDepth = 4, checkExtension = true, options = {}) {
          this.qMaxDepth = qMaxDepth;
          this.checkExtension = checkExtension;
          this.nodesSearched = 0;
          this.transpositionTable?.newSearch();
          this.killerMoves.clear();
          const analysis = options.analysis ?? false;
          const randomness = options.randomness ?? 0;
          const moves = (0, MoveGenerator_1.generateLegalMoves)(board);
          if (moves.length === 0) {
            const inCheck = (0, AttackDetector_1.isKingInCheck)(board);
            const score = inCheck ? Evaluator_1.SCORE_MIN + 0 : 0;
            return { move: null, score, depth: 0, nodesSearched: this.nodesSearched };
          }
          let bestMove = null;
          let bestScore = Evaluator_1.SCORE_MIN;
          let scoredMoves;
          const ASPIRATION_DELTA = 25;
          for (let d = 1; d <= baseDepth; d++) {
            const collectScores = d === baseDepth && (randomness > 0 || analysis);
            let alpha = Evaluator_1.SCORE_MIN;
            let beta = Evaluator_1.SCORE_MAX;
            let delta = ASPIRATION_DELTA;
            if (d >= 4 && bestScore > Evaluator_1.SCORE_MIN && bestScore < Evaluator_1.SCORE_MAX) {
              alpha = bestScore - delta;
              beta = bestScore + delta;
            }
            let iterBestMove = null;
            let iterBestScore = Evaluator_1.SCORE_MIN;
            let iterScoredMoves = null;
            while (true) {
              const pvMove = this.transpositionTable?.getBestMove(board.zobristHash) ?? null;
              const selector = new MoveOrdering_1.MoveSelector(moves, pvMove, this.killerMoves, 0);
              iterScoredMoves = collectScores ? [] : null;
              iterBestMove = null;
              iterBestScore = Evaluator_1.SCORE_MIN;
              let iterAlpha = alpha;
              let move;
              let moveIndex = 0;
              while ((move = selector.pickNext()) !== null) {
                if (move.flags & types_1.MoveFlag.PROMOTION && move.promotionPiece) {
                  const isQueenPromotion = move.promotionPiece === types_1.Piece.WHITE_QUEEN || move.promotionPiece === types_1.Piece.BLACK_QUEEN;
                  if (!isQueenPromotion)
                    continue;
                }
                const child = (0, Board_1.copyBoard)(board);
                (0, MoveGenerator_1.applyMoveComplete)(child, move);
                const extension = this.checkExtension && child.isCheck ? 1 : 0;
                let score;
                if (moveIndex === 0) {
                  score = -this.negamax(child, d - 1 + extension, -beta, -iterAlpha, 1);
                } else {
                  score = -this.negamax(child, d - 1 + extension, -iterAlpha - 1, -iterAlpha, 1);
                  if (score > iterAlpha && score < beta) {
                    score = -this.negamax(child, d - 1 + extension, -beta, -iterAlpha, 1);
                  }
                }
                moveIndex++;
                if (iterScoredMoves) {
                  iterScoredMoves.push({ move, score });
                }
                if (score > iterBestScore || iterBestMove === null) {
                  iterBestScore = score;
                  iterBestMove = move;
                }
                if (score > iterAlpha)
                  iterAlpha = score;
                if (iterAlpha >= beta)
                  break;
              }
              if (d >= 4 && (alpha > Evaluator_1.SCORE_MIN || beta < Evaluator_1.SCORE_MAX)) {
                if (iterBestScore <= alpha) {
                  delta *= 2;
                  alpha = delta > 400 ? Evaluator_1.SCORE_MIN : Math.max(Evaluator_1.SCORE_MIN, alpha - delta);
                  continue;
                }
                if (iterBestScore >= beta) {
                  delta *= 2;
                  beta = delta > 400 ? Evaluator_1.SCORE_MAX : Math.min(Evaluator_1.SCORE_MAX, beta + delta);
                  continue;
                }
              }
              break;
            }
            if (iterScoredMoves) {
              iterScoredMoves.sort((a, b) => b.score - a.score);
              scoredMoves = iterScoredMoves;
              if (iterScoredMoves.length > 0) {
                bestMove = iterScoredMoves[0].move;
                bestScore = iterScoredMoves[0].score;
              }
            } else if (iterBestMove) {
              bestMove = iterBestMove;
              bestScore = iterBestScore;
            }
          }
          if (randomness > 0 && scoredMoves && scoredMoves.length > 1) {
            const threshold = bestScore - randomness;
            let candidates = scoredMoves.filter((e) => e.score >= threshold);
            if (candidates.length > 1) {
              const bestIsCapture = !!(scoredMoves[0].move.flags & types_1.MoveFlag.CAPTURE);
              if (bestIsCapture) {
                const captureCandidates = candidates.filter((e) => e.move.flags & types_1.MoveFlag.CAPTURE);
                if (captureCandidates.length > 0)
                  candidates = captureCandidates;
              }
              bestMove = candidates[Math.floor(Math.random() * candidates.length)].move;
            }
          }
          return bestMove ? { move: bestMove, score: bestScore, depth: baseDepth, nodesSearched: this.nodesSearched, scoredMoves } : null;
        }
        negamax(board, depth, alpha, beta, ply) {
          this.nodesSearched++;
          if (depth <= 0) {
            return this.quiescence(board, alpha, beta, ply, 0);
          }
          const tt = this.transpositionTable;
          const hash = board.zobristHash;
          let ttMove = null;
          if (tt) {
            const entry = tt.probe(hash, depth, alpha, beta, ply);
            if (entry) {
              ttMove = entry.bestMove;
              if (entry.type === TranspositionTable_1.TTEntryType.EXACT)
                return entry.score;
              if (entry.type === TranspositionTable_1.TTEntryType.LOWER_BOUND && entry.score >= beta)
                return entry.score;
              if (entry.type === TranspositionTable_1.TTEntryType.UPPER_BOUND && entry.score <= alpha)
                return entry.score;
            }
          }
          const moves = (0, MoveGenerator_1.generatePseudoLegalMoves)(board);
          const selector = new MoveOrdering_1.MoveSelector(moves, ttMove, this.killerMoves, ply);
          const startAlpha = alpha;
          let bestScore = -INF;
          let bestMove = null;
          let legalMoveCount = 0;
          let move;
          while ((move = selector.pickNext()) !== null) {
            if (move.flags & types_1.MoveFlag.PROMOTION && move.promotionPiece) {
              const isQueenPromotion = move.promotionPiece === types_1.Piece.WHITE_QUEEN || move.promotionPiece === types_1.Piece.BLACK_QUEEN;
              if (!isQueenPromotion)
                continue;
            }
            const child = (0, Board_1.copyBoard)(board);
            (0, MoveGenerator_1.applyMoveComplete)(child, move);
            if (this.isIllegalMove(child))
              continue;
            legalMoveCount++;
            const extension = this.checkExtension && child.isCheck ? 1 : 0;
            let score;
            if (legalMoveCount === 1) {
              score = -this.negamax(child, depth - 1 + extension, -beta, -alpha, ply + 1);
            } else {
              score = -this.negamax(child, depth - 1 + extension, -alpha - 1, -alpha, ply + 1);
              if (score > alpha && score < beta) {
                score = -this.negamax(child, depth - 1 + extension, -beta, -alpha, ply + 1);
              }
            }
            if (score > bestScore || bestMove === null) {
              bestScore = score;
              bestMove = move;
            }
            if (score > alpha)
              alpha = score;
            if (alpha >= beta) {
              this.killerMoves.store(move, ply);
              break;
            }
          }
          if (legalMoveCount === 0) {
            if ((0, AttackDetector_1.isKingInCheck)(board))
              return Evaluator_1.SCORE_MIN + ply;
            return 0;
          }
          if (tt && bestMove) {
            let type = TranspositionTable_1.TTEntryType.EXACT;
            if (bestScore <= startAlpha)
              type = TranspositionTable_1.TTEntryType.UPPER_BOUND;
            else if (bestScore >= beta)
              type = TranspositionTable_1.TTEntryType.LOWER_BOUND;
            tt.store(hash, depth, bestScore, type, bestMove, ply);
          }
          return bestScore;
        }
        quiescence(board, alpha, beta, ply, qDepth) {
          this.nodesSearched++;
          const standPat = Evaluator_1.Evaluator.evaluate(board, board.turn, ply);
          if (standPat >= beta)
            return standPat;
          if (standPat > alpha)
            alpha = standPat;
          if (qDepth >= this.qMaxDepth)
            return standPat;
          const allMoves = (0, MoveGenerator_1.generatePseudoLegalMoves)(board);
          const forcingMask = types_1.MoveFlag.CAPTURE | types_1.MoveFlag.PROMOTION;
          const forcing = [];
          for (let i = 0; i < allMoves.length; i++) {
            if (allMoves[i].flags & forcingMask)
              forcing.push(allMoves[i]);
          }
          const tt = this.transpositionTable;
          const ttMove = tt ? tt.getBestMove(board.zobristHash) : null;
          const selector = new MoveOrdering_1.MoveSelector(forcing, ttMove, this.killerMoves, ply);
          let bestScore = standPat;
          let legalForcingFound = false;
          let move;
          while ((move = selector.pickNext()) !== null) {
            if (move.flags & types_1.MoveFlag.PROMOTION && move.promotionPiece) {
              const isQueenPromotion = move.promotionPiece === types_1.Piece.WHITE_QUEEN || move.promotionPiece === types_1.Piece.BLACK_QUEEN;
              if (!isQueenPromotion)
                continue;
            }
            const child = (0, Board_1.copyBoard)(board);
            (0, MoveGenerator_1.applyMoveComplete)(child, move);
            if (this.isIllegalMove(child))
              continue;
            legalForcingFound = true;
            const score = -this.quiescence(child, -beta, -alpha, ply + 1, qDepth + 1);
            if (score > bestScore)
              bestScore = score;
            if (score >= beta)
              return score;
            if (score > alpha)
              alpha = score;
          }
          if (!legalForcingFound && (0, AttackDetector_1.isKingInCheck)(board)) {
            for (const m of allMoves) {
              if (m.flags & types_1.MoveFlag.CAPTURE || m.flags & types_1.MoveFlag.PROMOTION)
                continue;
              const child = (0, Board_1.copyBoard)(board);
              (0, MoveGenerator_1.applyMoveComplete)(child, m);
              if (!this.isIllegalMove(child))
                return standPat;
            }
            return Evaluator_1.SCORE_MIN + ply;
          }
          return bestScore;
        }
        /**
         * Check if a move was illegal (left own king in check) after applyMoveComplete.
         * After applyMoveComplete, board.turn has switched, so the "previous" side
         * is the opponent of board.turn.
         */
        isIllegalMove(child) {
          const prevColor = child.turn === types_1.InternalColor.WHITE ? types_1.InternalColor.BLACK : types_1.InternalColor.WHITE;
          const prevKingBB = prevColor === types_1.InternalColor.WHITE ? child.whiteKing : child.blackKing;
          if (prevKingBB === 0n)
            return false;
          const prevKingSq = (0, conversion_1.getLowestSetBit)(prevKingBB);
          return (0, AttackDetector_1.isSquareAttacked)(child, prevKingSq, child.turn);
        }
      };
      exports.Search = Search;
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/AIEngine.js
  var require_AIEngine = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/ai/AIEngine.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.AIEngine = void 0;
      var Search_1 = require_Search();
      var MoveGenerator_1 = require_MoveGenerator();
      var types_1 = require_types();
      var LEVEL_CONFIG = {
        // NOTE: Depth is the single biggest speed lever.
        // These values are intentionally conservative for browser-friendliness.
        // Tuning note (2026-02): lower levels intentionally omit tactical extensions
        // (check extensions + deep quiescence) so they're easier to beat.
        1: { baseDepth: 1, extendedDepth: 0, checkExtension: false, qMaxDepth: 0 },
        // Beginner
        2: { baseDepth: 2, extendedDepth: 0, checkExtension: true, qMaxDepth: 0 },
        // Easy
        3: { baseDepth: 2, extendedDepth: 1, checkExtension: true, qMaxDepth: 1 },
        // Intermediate (default)
        4: { baseDepth: 3, extendedDepth: 2, checkExtension: true, qMaxDepth: 2 },
        // Advanced
        5: { baseDepth: 4, extendedDepth: 3, checkExtension: true, qMaxDepth: 4 }
        // Expert (unchanged)
      };
      var AIEngine = class {
        constructor() {
          __publicField(this, "search");
          __publicField(this, "currentTTSize", 16);
          this.search = new Search_1.Search(this.currentTTSize);
        }
        /**
         * Find the best move for the current position
         *
         * @param board - Current board state
        * @param level - AI difficulty level (1-5, default 3)
         * @param ttSizeMB - Transposition table size in MB (0 to disable, min 0.25 MB, auto-scaled by level)
         * @returns Best move found by the AI
         */
        findBestMove(board, level = 3, ttSizeMB = 16, depth, randomness) {
          const result = this.findBestMoveDetailed(board, { level, ttSizeMB, depth, analysis: false, randomness });
          return result ? result.move : null;
        }
        /**
         * Find the best move, including optional analysis (root move scores).
         *
         * Used by the public `ai(..., { analysis: true })` API.
         */
        findBestMoveDetailed(board, options = {}) {
          const level = options.level ?? 3;
          const ttSizeMB = options.ttSizeMB ?? 16;
          if (ttSizeMB !== this.currentTTSize) {
            this.currentTTSize = ttSizeMB;
            this.search = new Search_1.Search(ttSizeMB);
          }
          const config = LEVEL_CONFIG[level];
          const baseDepth = options.depth?.base ?? config.baseDepth;
          const extendedDepth = options.depth?.extended ?? config.extendedDepth;
          const qMaxDepth = options.depth?.quiescence ?? config.qMaxDepth;
          const checkExtension = options.depth?.check ?? config.checkExtension;
          const effectiveDepth = this.getAdaptiveDepth(board, baseDepth, extendedDepth);
          const OPENING_RANDOMNESS = 5;
          const effectiveRandomness = options.randomness === void 0 && board.fullMoveNumber === 1 ? OPENING_RANDOMNESS : options.randomness ?? 0;
          return this.search.findBestMove(board, effectiveDepth, qMaxDepth, checkExtension, {
            analysis: options.analysis ?? false,
            randomness: effectiveRandomness
          });
        }
        /**
        * Get the search depth for a given AI level
         *
        * @param level - AI level (1-5)
         * @returns Depth configuration
         */
        static getLevelDepth(level) {
          return LEVEL_CONFIG[level];
        }
        /**
         * Adaptive depth heuristic.
         *
         * Contract:
         * - Input: board + baseDepth (from level)
         * - Output: adjusted depth (>= 1)
         *
        * Heuristic goals:
        * - Never search shallower than the requested level depth.
        * - If there are very few root legal moves (tactical / constrained), allow +1.
        * - If the position is simplified (few pieces), allow +1 or +2.
         */
        getAdaptiveDepth(board, baseDepth, allowedExtendedDepth) {
          if (allowedExtendedDepth <= 0)
            return Math.max(1, baseDepth);
          const rootMoves = (0, MoveGenerator_1.generateLegalMoves)(board).length;
          let pieceCount = 0;
          for (const p of board.mailbox) {
            if (p !== types_1.Piece.EMPTY)
              pieceCount++;
          }
          let depth = baseDepth;
          if (pieceCount <= 10)
            depth += 2;
          else if (pieceCount <= 18)
            depth += 1;
          if (rootMoves <= 12)
            depth += 1;
          if (depth < baseDepth)
            depth = baseDepth;
          if (depth < 1)
            depth = 1;
          const maxDepth = baseDepth + allowedExtendedDepth;
          if (depth > maxDepth)
            depth = maxDepth;
          return depth;
        }
      };
      exports.AIEngine = AIEngine;
    }
  });

  // C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/index.js
  var require_index = __commonJS({
    "C:/Users/LENOVO/AppData/Local/Temp/js-chess-engine-code-817dace9142f40b986b39ec37e999efc/package/dist/index.js"(exports) {
      var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = { enumerable: true, get: function() {
            return m[k];
          } };
        }
        Object.defineProperty(o, k2, desc);
      }) : (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        o[k2] = m[k];
      }));
      var __exportStar = exports && exports.__exportStar || function(m, exports2) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.Game = void 0;
      exports.moves = moves;
      exports.status = status;
      exports.getFen = getFen;
      exports.move = move;
      exports.aiMove = aiMove;
      exports.ai = ai;
      var Board_1 = require_Board();
      var MoveGenerator_1 = require_MoveGenerator();
      var AttackDetector_1 = require_AttackDetector();
      var fen_1 = require_fen();
      var conversion_1 = require_conversion();
      var TranspositionTable_1 = require_TranspositionTable();
      var APIAdapter_1 = require_APIAdapter();
      var AIEngine_1 = require_AIEngine();
      __exportStar(require_types(), exports);
      var Game = class {
        /**
         * Create a new game
         *
         * @param configuration - Optional board configuration (JSON object, FEN string, or undefined for new game)
         */
        constructor(configuration) {
          __publicField(this, "board");
          __publicField(this, "history", []);
          __publicField(this, "aiEngine");
          this.aiEngine = new AIEngine_1.AIEngine();
          if (!configuration) {
            this.board = (0, Board_1.createStartingBoard)();
          } else if (typeof configuration === "string") {
            (0, fen_1.validateFEN)(configuration);
            this.board = (0, fen_1.parseFEN)(configuration);
          } else {
            this.board = (0, APIAdapter_1.configToBoard)(configuration);
          }
        }
        /**
         * Make a move
         *
         * @param from - From square (case-insensitive, e.g., 'E2' or 'e2')
         * @param to - To square (case-insensitive, e.g., 'E4' or 'e4')
         * @returns Board configuration after the move
         */
        move(from, to) {
          const fromNorm = (0, APIAdapter_1.normalizeSquare)(from);
          const toNorm = (0, APIAdapter_1.normalizeSquare)(to);
          const fromIndex = (0, conversion_1.squareToIndex)(fromNorm);
          const toIndex = (0, conversion_1.squareToIndex)(toNorm);
          const legalMoves = (0, MoveGenerator_1.generateLegalMoves)(this.board);
          const move2 = legalMoves.find((m) => m.from === fromIndex && m.to === toIndex);
          if (!move2) {
            throw new Error(`Invalid move from ${fromNorm} to ${toNorm}`);
          }
          const historyEntry = { [fromNorm]: toNorm };
          this.history.push(historyEntry);
          (0, MoveGenerator_1.applyMoveComplete)(this.board, move2);
          return (0, APIAdapter_1.boardToConfig)(this.board);
        }
        /**
         * Get all legal moves, optionally filtered by from-square
         *
         * @param from - Optional from square to filter moves
         * @returns Map of from-squares to array of to-squares
         */
        moves(from) {
          if (from) {
            const fromNorm = (0, APIAdapter_1.normalizeSquare)(from);
            const fromIndex = (0, conversion_1.squareToIndex)(fromNorm);
            const pieceMoves = (0, MoveGenerator_1.getMovesForPiece)(this.board, fromIndex);
            const toSquares = (0, APIAdapter_1.movesFromSquare)(pieceMoves, fromIndex);
            return { [fromNorm]: toSquares };
          } else {
            const allMoves = (0, MoveGenerator_1.generateLegalMoves)(this.board);
            return (0, APIAdapter_1.movesToMap)(allMoves);
          }
        }
        /**
         * Set a piece on a square
         *
         * @param square - Square to place piece (case-insensitive)
         * @param piece - Piece symbol (K, Q, R, B, N, P, k, q, r, b, n, p)
         */
        setPiece(square, piece) {
          const squareNorm = (0, APIAdapter_1.normalizeSquare)(square);
          const squareIndex = (0, conversion_1.squareToIndex)(squareNorm);
          const pieceEnum = (0, APIAdapter_1.symbolToPiece)(piece);
          (0, Board_1.setPiece)(this.board, squareIndex, pieceEnum);
        }
        /**
         * Remove a piece from a square
         *
         * @param square - Square to remove piece from (case-insensitive)
         */
        removePiece(square) {
          const squareNorm = (0, APIAdapter_1.normalizeSquare)(square);
          const squareIndex = (0, conversion_1.squareToIndex)(squareNorm);
          (0, Board_1.removePiece)(this.board, squareIndex);
        }
        /**
         * Get move history
         *
         * @returns Array of history entries with board state after each move
         */
        getHistory() {
          const result = [];
          const startingBoard = typeof this.board === "string" ? (0, fen_1.parseFEN)(this.board) : (0, Board_1.createStartingBoard)();
          const tempBoard = (0, Board_1.copyBoard)(startingBoard);
          for (const move2 of this.history) {
            const [from, to] = Object.entries(move2)[0];
            const fromIndex = (0, conversion_1.squareToIndex)(from);
            const toIndex = (0, conversion_1.squareToIndex)(to);
            const legalMoves = (0, MoveGenerator_1.generateLegalMoves)(tempBoard);
            const matchingMove = legalMoves.find((m) => m.from === fromIndex && m.to === toIndex);
            if (matchingMove) {
              (0, MoveGenerator_1.applyMoveComplete)(tempBoard, matchingMove);
              const config = (0, APIAdapter_1.boardToConfig)(tempBoard);
              result.push({ ...config, move: move2 });
            }
          }
          return result;
        }
        /**
         * Export current board state as JSON configuration
         *
         * @returns Board configuration object
         */
        exportJson() {
          const cfg = (0, APIAdapter_1.boardToConfig)(this.board);
          this.updateConfigStatusFromBoard(this.board, cfg);
          return cfg;
        }
        /**
         * Export current board state as FEN string
         *
         * @returns FEN string
         */
        exportFEN() {
          return (0, fen_1.toFEN)(this.board);
        }
        /**
         * Print board to console (Unicode chess pieces)
         */
        printToConsole() {
          process.stdout.write("\n");
          for (let rank = 7; rank >= 0; rank--) {
            process.stdout.write(`${rank + 1}`);
            for (let file = 0; file < 8; file++) {
              const index = rank * 8 + file;
              const piece = this.board.mailbox[index];
              const isWhiteSquare = (rank + file) % 2 === 0;
              const symbol = pieceToUnicode(piece, isWhiteSquare);
              process.stdout.write(symbol);
            }
            process.stdout.write("\n");
          }
          process.stdout.write(" ABCDEFGH\n");
        }
        /**
         * Make an AI move (v1 compatible - returns only the move)
         *
         * @deprecated Use `ai()` instead. This method will be removed in v3.0.0.
         * @param level - AI level (1-5, default 3)
         * @returns The played move object (e.g., {"E2": "E4"})
         */
        aiMove(level = 3) {
          if (level < 1 || level > 5) {
            throw new Error("AI level must be between 1 and 5");
          }
          const ttSizeMB = (0, TranspositionTable_1.getRecommendedTTSize)(level);
          const bestMove = this.aiEngine.findBestMove(this.board, level, ttSizeMB);
          if (!bestMove) {
            throw new Error("Game is already finished");
          }
          const fromSquare = (0, conversion_1.indexToSquare)(bestMove.from);
          const toSquare = (0, conversion_1.indexToSquare)(bestMove.to);
          const historyEntry = { [fromSquare]: toSquare };
          this.history.push(historyEntry);
          (0, MoveGenerator_1.applyMoveComplete)(this.board, bestMove);
          return historyEntry;
        }
        /**
         * Make an AI move and return both move and board state
         *
         * @param options - Optional configuration object
         * @param options.level - AI difficulty level (1-5, default: 3). Values > 5 are clamped to 5.
         * @param options.play - Whether to apply the move to the game (default: true). If false, only returns the move without modifying game state.
         * @param options.ttSizeMB - Transposition table size in MB (0 to disable, min 0.25 MB). Default: auto-scaled by level (e.g., level 3: 2 MB Node.js, 1 MB browser)
         * @param options.randomness - Centipawn threshold for move variety. The engine picks randomly
         *   among all moves scoring within this many centipawns of the best move.
         *   Makes the engine less predictable without playing blunders.
         *   Default: 0 (fully deterministic). Set to a positive value for variety.
         *
         *   Reference values:
         *     0   – fully deterministic (default; same position always plays the same move)
         *     10  – very subtle (only nearly-identical moves ever swap)
         *     30  – slight variety (moves within ~½ pawn of best may vary)
         *     80  – noticeable (moves within ~1½ pawns of best may vary; fun casual play)
         *     200 – chaotic (may play obviously weaker moves; not recommended)
         * @returns Object containing the move and board configuration (current state if play=false, updated state if play=true)
         */
        ai(options = {}) {
          const requestedLevel = options.level ?? 3;
          const level = Math.max(1, Math.min(5, requestedLevel));
          const play = options.play ?? true;
          const analysis = options.analysis ?? false;
          const defaultSize = (0, TranspositionTable_1.getRecommendedTTSize)(level);
          const ttSizeMB = options.ttSizeMB === 0 ? 0 : Math.max(0.25, options.ttSizeMB ?? defaultSize);
          if (requestedLevel < 1 || requestedLevel > 5) {
            throw new Error("AI level must be between 1 and 5");
          }
          if (options.depth) {
            const d = options.depth;
            if (d.base !== void 0 && (!Number.isInteger(d.base) || d.base < 1)) {
              throw new Error("depth.base must be an integer > 0");
            }
            if (d.extended !== void 0 && (!Number.isInteger(d.extended) || d.extended < 0 || d.extended > 3)) {
              throw new Error("depth.extended must be an integer between 0 and 3");
            }
            if (d.quiescence !== void 0 && (!Number.isInteger(d.quiescence) || d.quiescence < 0)) {
              throw new Error("depth.quiescence must be an integer >= 0");
            }
            if (d.check !== void 0 && typeof d.check !== "boolean") {
              throw new Error("depth.check must be a boolean");
            }
          }
          if (options.randomness !== void 0) {
            if (typeof options.randomness !== "number" || !isFinite(options.randomness) || options.randomness < 0) {
              throw new Error("randomness must be a non-negative number");
            }
          }
          const searchResult = analysis ? this.aiEngine.findBestMoveDetailed(this.board, { level, ttSizeMB, depth: options.depth, analysis: true, randomness: options.randomness }) : null;
          const bestMove = searchResult ? searchResult.move : this.aiEngine.findBestMove(this.board, level, ttSizeMB, options.depth, options.randomness);
          if (!bestMove) {
            throw new Error("Game is already finished");
          }
          const fromSquare = (0, conversion_1.indexToSquare)(bestMove.from);
          const toSquare = (0, conversion_1.indexToSquare)(bestMove.to);
          const historyEntry = { [fromSquare]: toSquare };
          const analysisFields = analysis && searchResult?.scoredMoves ? {
            analysis: searchResult.scoredMoves.map(({ move: move2, score }) => {
              const from = (0, conversion_1.indexToSquare)(move2.from);
              const to = (0, conversion_1.indexToSquare)(move2.to);
              const historyMove = { [from]: to };
              return { move: historyMove, score };
            }),
            depth: searchResult.depth,
            nodesSearched: searchResult.nodesSearched,
            bestScore: searchResult.score
          } : void 0;
          if (!play) {
            const cfg2 = (0, APIAdapter_1.boardToConfig)(this.board);
            this.updateConfigStatusFromBoard(this.board, cfg2);
            return { move: historyEntry, board: cfg2, ...analysisFields ?? {} };
          }
          this.history.push(historyEntry);
          (0, MoveGenerator_1.applyMoveComplete)(this.board, bestMove);
          const cfg = (0, APIAdapter_1.boardToConfig)(this.board);
          this.updateConfigStatusFromBoard(this.board, cfg);
          return {
            move: historyEntry,
            board: cfg,
            ...analysisFields ?? {}
          };
        }
        updateConfigStatusFromBoard(board, cfg) {
          const inCheck = (0, AttackDetector_1.isKingInCheck)(board);
          const moves2 = (0, MoveGenerator_1.generateLegalMoves)(board);
          const isMate = inCheck && moves2.length === 0;
          const isStalemate = !inCheck && moves2.length === 0;
          cfg.check = inCheck;
          cfg.checkMate = isMate;
          cfg.staleMate = isStalemate;
          cfg.isFinished = isMate || isStalemate;
        }
      };
      exports.Game = Game;
      function pieceToUnicode(piece, isWhiteSquare) {
        const symbols = {
          0: isWhiteSquare ? "\u2588" : "\u2591",
          // EMPTY - filled/light block
          1: "\u2659",
          // WHITE_PAWN ♙
          2: "\u2658",
          // WHITE_KNIGHT ♘
          3: "\u2657",
          // WHITE_BISHOP ♗
          4: "\u2656",
          // WHITE_ROOK ♖
          5: "\u2655",
          // WHITE_QUEEN ♕
          6: "\u2654",
          // WHITE_KING ♔
          7: "\u265F",
          // BLACK_PAWN ♟
          8: "\u265E",
          // BLACK_KNIGHT ♞
          9: "\u265D",
          // BLACK_BISHOP ♝
          10: "\u265C",
          // BLACK_ROOK ♜
          11: "\u265B",
          // BLACK_QUEEN ♛
          12: "\u265A"
          // BLACK_KING ♚
        };
        return symbols[piece] || (isWhiteSquare ? "\u2588" : "\u2591");
      }
      function moves(config) {
        const game = new Game(config);
        return game.moves();
      }
      function status(config) {
        const game = new Game(config);
        return game.exportJson();
      }
      function getFen(config) {
        const game = new Game(config);
        return game.exportFEN();
      }
      function move(config, from, to) {
        const game = new Game(config);
        return game.move(from, to);
      }
      function aiMove(config, level = 3) {
        const game = new Game(config);
        return game.aiMove(level);
      }
      function ai(config, options = {}) {
        const game = new Game(config);
        return game.ai(options);
      }
    }
  });
  return require_index();
})();
