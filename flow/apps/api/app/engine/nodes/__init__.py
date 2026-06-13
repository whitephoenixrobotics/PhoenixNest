"""
Node handler registry.

To add a new block:
  1. Create a handler file (e.g. ai/my_block.py) with a class extending BaseNodeHandler
  2. Import it here and register it in NODE_REGISTRY with its type string
"""
from app.engine.nodes.base import BaseNodeHandler
from app.engine.nodes.input.image_upload import ImageUploadHandler
from app.engine.nodes.input.webcam_capture import WebcamCaptureHandler
from app.engine.nodes.input.text_input import TextInputHandler
from app.engine.nodes.input.switch import SwitchHandler
from app.engine.nodes.input.button import ButtonHandler
from app.engine.nodes.input.color_picker import ColorPickerHandler
from app.engine.nodes.input.hotkey import HotkeyHandler
from app.engine.nodes.input.speech_to_text import SpeechToTextHandler
from app.engine.nodes.input.http_fetch import HttpFetchHandler
from app.engine.nodes.input.draw_pad import DrawPadHandler
from app.engine.nodes.data.json_extract import JsonExtractHandler
from app.engine.nodes.data.table import DataTableHandler
from app.engine.nodes.data.table_read import TableReadHandler
from app.engine.nodes.data.aggregate import AggregateHandler
from app.engine.nodes.data.filter import FilterHandler
from app.engine.nodes.data.join_text import JoinTextHandler
from app.engine.nodes.data.sheets_write import SheetsWriteHandler
from app.engine.nodes.data.text_transform import TextTransformHandler
from app.engine.nodes.output.chart import ChartHandler
from app.engine.nodes.ai.detect import DetectHandler
from app.engine.nodes.ai.classifier import ClassifierHandler
from app.engine.nodes.ai.pose import PoseHandler
from app.engine.nodes.ai.object_count import ObjectCountHandler
from app.engine.nodes.ai.color_detect import ColorDetectHandler
from app.engine.nodes.ai.ocr import OcrHandler
from app.engine.nodes.ai.face.face_mesh import FaceMeshHandler
from app.engine.nodes.ai.face.face_count import FaceCountHandler
from app.engine.nodes.ai.face.emotion import EmotionHandler
from app.engine.nodes.dl.mnist import MnistHandler
from app.engine.nodes.dl.style_transfer import StyleTransferHandler
from app.engine.nodes.dl.segmentation import SegmentationHandler
from app.engine.nodes.dl.deep_detect import DeepDetectHandler
from app.engine.nodes.dl.deep_classifier import DeepClassifierHandler
from app.engine.nodes.dl.tracking import ObjectTrackingHandler
from app.engine.nodes.logic.if_else import IfElseHandler
from app.engine.nodes.logic.compare import CompareHandler
from app.engine.nodes.logic.counter import CounterHandler
from app.engine.nodes.logic.toggle import ToggleHandler
from app.engine.nodes.logic.trigger_once import TriggerOnceHandler
from app.engine.nodes.logic.hold import HoldHandler
from app.engine.nodes.time.delay import DelayHandler
from app.engine.nodes.time.schedule import ScheduleHandler
from app.engine.nodes.time.interval import IntervalHandler
from app.engine.nodes.loop.for_each import ForEachHandler
from app.engine.nodes.loop.repeat import RepeatHandler
from app.engine.nodes.loop.while_loop import WhileHandler
from app.engine.nodes.math.number import NumberHandler
from app.engine.nodes.math.random_number import RandomNumberHandler
from app.engine.nodes.math.math_op import MathOpHandler
from app.engine.nodes.math.math_function import MathFunctionHandler
from app.engine.nodes.math.map_range import MapRangeHandler
from app.engine.nodes.math.clamp import ClampHandler
from app.engine.nodes.math.statistics import StatisticsHandler
from app.engine.nodes.logic_gate.gates import (
    ANDGate, ORGate, NOTGate, NANDGate, NORGate, XORGate, XNORGate,
)
from app.engine.nodes.ai.face.smile import SmileHandler
from app.engine.nodes.ai.face.face_recognition import FaceRecognitionHandler
from app.engine.nodes.output.display import DisplayHandler
from app.engine.nodes.output.light_bulb import LightBulbHandler
from app.engine.nodes.output.tts import TextToSpeechHandler
from app.engine.nodes.output.play_sound import PlaySoundHandler
from app.engine.nodes.image.enhance import (
    BrightnessHandler, ContrastHandler, SaturationHandler, SharpenHandler,
)
from app.engine.nodes.image.filters import GrayscaleHandler, InvertHandler, BlurHandler
from app.engine.nodes.image.rgb import RGBAdjustHandler
from app.engine.nodes.hardware.digital_write import ArduinoDigitalWriteHandler
from app.engine.nodes.hardware.analog_write import ArduinoAnalogWriteHandler
from app.engine.nodes.hardware.servo import ArduinoServoHandler
from app.engine.nodes.hardware.digital_read import ArduinoDigitalReadHandler
from app.engine.nodes.hardware.analog_read import ArduinoAnalogReadHandler
from app.engine.nodes.messaging.line_push_text import LinePushTextHandler
from app.engine.nodes.messaging.line_push_image import LinePushImageHandler
from app.engine.nodes.messaging.line_push_sticker import LinePushStickerHandler
from app.engine.nodes.messaging.line_push_flex import LinePushFlexHandler

NODE_REGISTRY: dict[str, BaseNodeHandler] = {
    # Input
    "image_upload": ImageUploadHandler(),
    "webcam_capture": WebcamCaptureHandler(),
    "text_input": TextInputHandler(),
    "switch": SwitchHandler(),
    "button": ButtonHandler(),
    "color_picker": ColorPickerHandler(),
    "hotkey": HotkeyHandler(),
    "speech_to_text": SpeechToTextHandler(),
    "http_fetch": HttpFetchHandler(),
    "draw_pad": DrawPadHandler(),
    "json_extract": JsonExtractHandler(),
    "data_table": DataTableHandler(),
    "table_read": TableReadHandler(),
    "aggregate":  AggregateHandler(),
    "filter":     FilterHandler(),
    "join_text":  JoinTextHandler(),
    "sheets_write": SheetsWriteHandler(),
    "text_transform": TextTransformHandler(),
    # AI
    "detect": DetectHandler(),
    "classifier": ClassifierHandler(),
    "pose": PoseHandler(),
    "object_count": ObjectCountHandler(),
    "color_detect": ColorDetectHandler(),
    "ocr": OcrHandler(),
    "face_mesh": FaceMeshHandler(),
    "face_count": FaceCountHandler(),
    "smile": SmileHandler(),
    "face_recognition": FaceRecognitionHandler(),
    "emotion": EmotionHandler(),
    # Deep Learning
    "mnist": MnistHandler(),
    "style_transfer": StyleTransferHandler(),
    "segmentation": SegmentationHandler(),
    "deep_detect": DeepDetectHandler(),
    "deep_classifier": DeepClassifierHandler(),
    "tracking": ObjectTrackingHandler(),
    # Image editing
    "brightness": BrightnessHandler(),
    "contrast": ContrastHandler(),
    "saturation": SaturationHandler(),
    "sharpen": SharpenHandler(),
    "grayscale": GrayscaleHandler(),
    "invert": InvertHandler(),
    "blur": BlurHandler(),
    "rgb_adjust": RGBAdjustHandler(),
    # Logic
    "if_else": IfElseHandler(),
    "compare": CompareHandler(),
    "counter": CounterHandler(),
    "toggle": ToggleHandler(),
    "trigger_once": TriggerOnceHandler(),
    "hold": HoldHandler(),
    # Time
    "delay": DelayHandler(),
    "schedule": ScheduleHandler(),
    "interval": IntervalHandler(),
    # Loop
    "for_each": ForEachHandler(),
    "repeat": RepeatHandler(),
    "while": WhileHandler(),
    # Math
    "number": NumberHandler(),
    "random_number": RandomNumberHandler(),
    "math_op": MathOpHandler(),
    "math_function": MathFunctionHandler(),
    "map_range": MapRangeHandler(),
    "clamp": ClampHandler(),
    "statistics": StatisticsHandler(),
    # Logic gates
    "gate_and":  ANDGate(),
    "gate_or":   ORGate(),
    "gate_not":  NOTGate(),
    "gate_nand": NANDGate(),
    "gate_nor":  NORGate(),
    "gate_xor":  XORGate(),
    "gate_xnor": XNORGate(),
    # Output
    "display": DisplayHandler(),
    "chart": ChartHandler(),
    "light_bulb": LightBulbHandler(),
    "tts": TextToSpeechHandler(),
    "play_sound": PlaySoundHandler(),
    # Hardware extensions — Arduino UNO (Phoenix Extensions, v0.4)
    "arduino_digital_write": ArduinoDigitalWriteHandler(),
    "arduino_analog_write":  ArduinoAnalogWriteHandler(),
    "arduino_servo":         ArduinoServoHandler(),
    "arduino_digital_read":  ArduinoDigitalReadHandler(),
    "arduino_analog_read":   ArduinoAnalogReadHandler(),
    # Messaging connectors
    "line_push_text":    LinePushTextHandler(),
    "line_push_image":   LinePushImageHandler(),
    "line_push_sticker": LinePushStickerHandler(),
    "line_push_flex":    LinePushFlexHandler(),
}
